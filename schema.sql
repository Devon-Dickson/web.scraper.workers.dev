DROP TABLE IF EXISTS Recipes;

CREATE TABLE IF NOT EXISTS Recipes (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    excerpt TEXT,
    ingredients_raw TEXT,
    steps_raw TEXT,
    source_url TEXT NOT NULL,
    image_url TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_source_url ON recipes(source_url);