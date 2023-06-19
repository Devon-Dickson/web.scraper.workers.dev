import { Hono } from "hono"

import Scraper from './scraper.js'
import { generateJSONResponse, generateErrorJSONResponse } from './json-response.js'

type Recipe = {
  title: string;
  excerpt?: string;
  ingredients_raw?: string;
  steps_raw?: string;
  source_url: string
}

const app = new Hono()

export default app

app.post("/api/recipes/", async ({ req, env }) => {
  const { url } = await req.json()

  if (!url) {
    return new Response(
      "Missing url parameter",
      { status: 400 }
    )
  }

  return handleAPIRequest(url, env)
})

app.get("/api/recipes/", async ({ req, env }: { req: any, env: Env }) => {
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

async function handleAPIRequest(url: string, env: Env) {
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
      await env.DB.prepare('INSERT INTO Recipes (title, excerpt, ingredients_raw, steps_raw, source_url) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(result.title[0], result.excerpt[0], result.ingredients_raw[0], result.steps_raw[0], url)
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
