import { Hono } from "hono"
import { cors } from 'hono/cors'

import Scraper from './scraper.js'
import { generateJSONResponse, generateErrorJSONResponse } from './json-response.js'

import type { Env } from "./worker-configuration";
import type { Recipe } from "./types";

const app = new Hono<Env>()
app.use('/api/*', cors())

/**
 * List all Recipes
 */
app.get("/api/recipes/", async ({ env }) => {
  try {
    const stmt = env.DB.prepare("SELECT * FROM Recipes")

    const { results } = await stmt.all()

    return new Response(JSON.stringify(results), {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    })
  } catch (exc) {
    console.log(exc)
  }
})

/**
 * Get a single Recipe by ID
 */
app.get("/api/recipes/:recipe_id/", async ({ req, env }) => {
  const recipeId = req.param().recipe_id

  try {
    const stmt = env.DB.prepare("SELECT * FROM Recipes WHERE id=?1")

    const result = await stmt
      .bind(recipeId)
      .first<Recipe>()

    return new Response(JSON.stringify(result), {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    })
  } catch (exc) {
    console.log(exc)
  }
})

/**
 * Check to see if a recipe exists, and provide some meta if it does
 */
app.get("/api/check_recipes/", async ({ req, env }) => {
  const { searchParams } = new URL(req.url)
  let url = searchParams.get('url')

  if (!url) {
    return new Response(
      "Missing url parameter",
      { status: 400, headers: new Headers({  }) }
    )
  }

  try {
    const stmt = env.DB.prepare("SELECT * FROM Recipes WHERE source_url=?1")


    const results = await stmt
      .bind(url)
      .first()

    return new Response(JSON.stringify(results), {
      headers: {
        "content-type": "application/json;charset=UTF-8"
      }
    })
  } catch (exc) {
    console.log(exc)
  }
})

/**
 * Scrape a new recipe
 */
app.post("/api/recipes/", async ({ req, env }) => {
  const { url } = await req.json()

  if (!url) {
    return new Response(
      "Missing url parameter",
      { status: 400 }
    )
  }

  return scrapeRecipe(url, env)
})


async function scrapeRecipe(url: string, env: Env["Bindings"]) {
  let scraper: Scraper, result: Recipe

  try {
    scraper = await new Scraper().fetch(url)
  } catch (error) {
    return generateErrorJSONResponse(error)
  }

  try {
    // Assume that by passing the URL into new Scraper(), it knows what site we're on,
    // and thus knows what the relevant scrapers are...
    result = await scraper.scrape()

  } catch (error) {
    return generateErrorJSONResponse(error)
  }

  try {
    if (env) {
      // Save result to KV store, or DB if available?
      await env.DB.prepare('INSERT INTO Recipes (title, excerpt, ingredients_raw, steps_raw, source_url, image_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
        .bind(result.title[0], result.excerpt[0], result.ingredients_raw[0], result.steps_raw[0], url, result.image_url[0])
        .run()
    }

  } catch(exc) {
    console.debug(exc)

    if (exc.cause.message.includes("SqliteError: UNIQUE constraint failed")) {
      console.log(`Recipe with URL of ${url} already exists!`)
    }
  }

  return generateJSONResponse({ result })
}

export default app
