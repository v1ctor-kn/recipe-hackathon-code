async function getRecipes() {
  const ingredients = document.getElementById("ingredientInput").value;
  const response = await fetch("/get_recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ingredients })
  });

  const data = await response.json();
  displayRecipes(data.recipes);
}

function displayRecipes(recipes) {
  const container = document.getElementById("recipeContainer");
  container.innerHTML = "";

  recipes.forEach(recipe => {
    const card = document.createElement("div");
    card.className = "recipe-card";
    card.innerHTML = `<h3>${recipe.title}</h3><p>${recipe.description}</p>`;
    container.appendChild(card);
  });
}