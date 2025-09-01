/*
Simple frontend to call POST /get_recipes and render results.
Adjust API_URL if your backend runs on a different host/port.
*/
const API_URL = 'http://localhost:5000/get_recipes';

function createSkeletonCards(n = 3) {
    const container = document.getElementById('recipeContainer');
    container.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const card = document.createElement('div');
        card.className = 'recipe-card skeleton';
        card.style.height = '120px';
        container.appendChild(card);
    }
}

function renderRecipes(recipes) {
    const container = document.getElementById('recipeContainer');
    container.innerHTML = '';
    if (!recipes || recipes.length === 0) {
        document.getElementById('noResults').style.display = '';
        return;
    }
    document.getElementById('noResults').style.display = 'none';
    recipes.forEach(r => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
            <div class="title">${escapeHtml(r.title || 'Untitled')}</div>
            <div class="meta">
              <span>${escapeHtml(r.cook_time_minutes ? r.cook_time_minutes + ' min' : '—')}</span>
            </div>
            <div class="ingredients">${escapeHtml(r.description || '')}</div>
            <div style="margin-top:auto;color:var(--muted);font-size:0.9rem">
              <strong>Uses:</strong> ${Array.isArray(r.ingredients) ? escapeHtml(r.ingredients.join(', ')) : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function showError(message) {
    const container = document.getElementById('recipeContainer');
    container.innerHTML = `<div class="recipe-card"><strong>Error:</strong> ${escapeHtml(message)}</div>`;
    document.getElementById('noResults').style.display = 'none';
}

// small HTML escape helper
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
}

async function getRecipes() {
    const input = document.getElementById('ingredientInput');
    const ingredients = input ? input.value.trim() : '';
    if (!ingredients) {
        showError('Please enter some ingredients.');
        return;
    }

    const filters = {
        vegetarian: !!document.getElementById('filterVegetarian')?.checked,
        vegan: !!document.getElementById('filterVegan')?.checked,
        gluten_free: !!document.getElementById('filterGlutenFree')?.checked,
        dairy_free: !!document.getElementById('filterDairyFree')?.checked,
        nut_free: !!document.getElementById('filterNutFree')?.checked,
    };

    createSkeletonCards(3);
    document.getElementById('noResults').style.display = 'none';

    // timeout support
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ingredients, filters }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Server returned ${resp.status}: ${errText}`);
        }
        const data = await resp.json();
        if (data && data.recipes) {
            renderRecipes(data.recipes);
        } else if (data && data.error) {
            showError(data.error || 'Unknown error from server');
        } else {
            showError('No recipes returned.');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            showError('Request timed out. Try again.');
        } else {
            showError(err.message || 'Network error');
            console.error(err);
        }
    }
}

// Minimal fetch compatibility and debug helpers
if (typeof fetch !== 'function') {
    console.warn('fetch not found — applying XMLHttpRequest fallback.');
    window.fetch = function (url, opts = {}) {
        return new Promise(function (resolve, reject) {
            const xhr = new XMLHttpRequest();
            xhr.open(opts.method || 'GET', url, true);
            (opts.headers || {}).forEach?.(h => { }); // noop for older env
            if (opts.headers) {
                for (const k in opts.headers) {
                    xhr.setRequestHeader(k, opts.headers[k]);
                }
            }
            xhr.onreadystatechange = function () {
                if (xhr.readyState !== 4) return;
                const res = {
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    text: () => Promise.resolve(xhr.responseText),
                    json: () => {
                        try { return Promise.resolve(JSON.parse(xhr.responseText)); }
                        catch (e) { return Promise.reject(e); }
                    }
                };
                resolve(res);
            };
            xhr.onerror = function (e) { reject(e); };
            xhr.send(opts.body || null);
        });
    };
}

// small helper to log where errors come from
function debugLog(...args) {
    if (window.console && console.debug) console.debug('[recipe-debug]', ...args);
}

// expose globally so inline onclick works
window.getRecipes = getRecipes;