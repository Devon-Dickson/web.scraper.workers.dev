DROP TABLE IF EXISTS Recipes;

CREATE TABLE IF NOT EXISTS Recipes (
    id INTEGER PRIMARY KEY,
    name TEXT,
    description TEXT,
    url TEXT UNIQUE,
    image TEXT,
    thumbnailUrl TEXT,
    keywords TEXT,
    aggregateRatingCount INTEGER,
    aggregateRatingValue INTEGER,
    cookTime TEXT,
    totalTime TEXT,
    recipeYield TEXT,
    recipeIngredient TEXT,
    recipeInstructions TEXT,
    authorName TEXT,
    publisherName TEXT,
    publisherLogo TEXT,
    datePublished TEXT,
    dateModified TEXT
);