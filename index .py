import os
import re
import json
import logging

from flask import Flask, request, jsonify 
from flask_cors import CORS
from openai import OpenAI
import mysql.connector
from mysql.connector import Error as MySQLError

app = Flask(__name__)
CORS(app)
app.logger.setLevel(logging.INFO)

# Read OpenAI key from environment
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    app.logger.warning("OPENAI_API_KEY not set. Set the environment variable before running the server.")

# Initialize OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)

# MySQL config
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "your_user"),
    "password": os.getenv("DB_PASSWORD", "your_password"),
    "database": os.getenv("DB_NAME", "recipes_db"),
}

# Try to connect to DB
db = None
try:
    db = mysql.connector.connect(**DB_CONFIG)
    app.logger.info("Connected to MySQL database")
except MySQLError as e:
    app.logger.warning("Could not connect to MySQL: %s", e)
    db = None

@app.route("/get_recipes", methods=["POST"])
def get_recipes():
    if not OPENAI_API_KEY:
        return jsonify({"error": "Server misconfiguration: OPENAI_API_KEY not set."}), 401

    payload = request.get_json(silent=True) or {}
    ingredients = payload.get("ingredients", "")
    filters = payload.get("filters", {})

    if not isinstance(ingredients, str) or not ingredients.strip():
        return jsonify({"error": "Please provide a non-empty 'ingredients' string in request body."}), 400

    user_prompt = (
        f"Given these ingredients: {ingredients}\n"
        f"Filters: {json.dumps(filters)}\n\n"
        "Return a JSON object with a single key \"recipes\" which is an array of 3 recipe objects.\n"
        "Each recipe object must have: title (string), description (string), ingredients (array of strings), cook_time_minutes (integer).\n"
        "ONLY return the JSON object (no explanation, no markdown fences)."
    )

    messages = [
        {"role": "system", "content": "You are a JSON-only recipe generator. Always return only the JSON object requested."},
        {"role": "user", "content": user_prompt},
    ]

    try:
        # Use model from env or fallback
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,
            max_tokens=800,
        )
    except Exception as e:
        app.logger.error("OpenAI request failed: %s", e)
        return jsonify({"error": "Failed to call OpenAI API."}), 502

    # Attempt to extract text from response in a few possible shapes
    text = ""
    try:
        choice0 = resp.choices[0]
        # support attribute or dict-like shapes
        if hasattr(choice0, "message") and choice0.message:
            # some SDKs expose message as an object with 'content'
            msg = choice0.message
            text = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", "")
        else:
            # dict-like
            text = choice0.get("message", {}).get("content", "") or choice0.get("text", "")
    except Exception:
        text = str(resp)

    # Extract JSON block from the model output
    m = re.search(r"(\{.*\})", text, flags=re.S)
    json_text = m.group(1) if m else text.strip()

    try:
        data = json.loads(json_text)
    except Exception as e:
        app.logger.error("Failed to parse JSON from model output: %s\nOutput: %s", e, text)
        return jsonify({"error": "OpenAI returned invalid JSON."}), 502

    # Basic validation and normalization
    recipes = data.get("recipes") if isinstance(data, dict) else None
    if not isinstance(recipes, list) or len(recipes) == 0:
        return jsonify({"error": "No recipes returned from AI."}), 502

    normalized = []
    for r in recipes:
        if not isinstance(r, dict):
            continue
        title = r.get("title", "").strip() if isinstance(r.get("title", ""), str) else ""
        description = r.get("description", "").strip() if isinstance(r.get("description", ""), str) else ""
        ingreds = r.get("ingredients", [])
        if not isinstance(ingreds, list):
            # try to parse comma-separated string
            if isinstance(ingreds, str):
                ingreds = [i.strip() for i in ingreds.split(",") if i.strip()]
            else:
                ingreds = []
        cook = r.get("cook_time_minutes", None)
        try:
            cook = int(cook) if cook is not None else None
        except Exception:
            cook = None

        normalized.append({
            "title": title,
            "description": description,
            "ingredients": ingreds,
            "cook_time_minutes": cook,
        })

    # Optionally store or log to DB if connection exists (non-destructive: we only log)
    if db is not None and db.is_connected():
        try:
            cur = db.cursor()
            app.logger.info("DB connected: skipping automatic inserts to avoid schema assumptions.")
            cur.close()
        except Exception:
            app.logger.debug("DB present but could not be used.")

    return jsonify({"recipes": normalized}), 200

if __name__ == "__main__":
    # Run the flask app (development server)
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=os.getenv("FLASK_DEBUG", "0") == "1")