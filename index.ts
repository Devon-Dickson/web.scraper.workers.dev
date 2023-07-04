import { Hono } from "hono"
import { cors } from 'hono/cors'

import Scraper from './scraper.js'
import { generateJSONResponse, generateErrorJSONResponse } from './json-response.js'

import type { Env } from "./worker-configuration";
import type { Recipe } from "./types";

const app = new Hono<Env>()
app.use('/api/*', cors())

/**
 * Test Route to confirm the server is up
 */
app.get("/", async () => {
  return new Response("Hello World", { status: 200 })
})

/**
 * List all Recipes
 */
app.get("/api/recipes/", async ({ env }) => {
  try {
    const stmt = env.DB.prepare("SELECT * FROM Recipes ORDER BY id DESC")

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
    const stmt = env.DB.prepare("SELECT * FROM Recipes WHERE url=?1")


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

app.post("/api/scrape/", async ({ req, env }) => {
  const { url } = await req.json()

  if (!url) {
    return new Response(
      "Missing url field",
      { status: 400 }
    )
  }

  // Scrape the JSON-LD data from the site
  const scrapedData = await scrape(url)

  // Collect the relevant fields and save them to the DB
  const recipe = new Recipe(scrapedData)

  console.log("Recipe: ", recipe)

  try {
    await env.DB.prepare(`
      INSERT INTO Recipes (
        name,
        description,
        url,
        image,
        thumbnailUrl,
        keywords,
        aggregateRatingCount,
        aggregateRatingValue,
        cookTime,
        totalTime,
        recipeYield,
        recipeIngredient,
        recipeInstructions,
        authorName,
        publisherName,
        publisherLogo,
        datePublished,
        dateModified
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
      ON CONFLICT (url) DO
      UPDATE SET
        name=?1,
        description=?2,
        url=?3,
        image=?4,
        thumbnailUrl=?5,
        keywords=?6,
        aggregateRatingCount=?7,
        aggregateRatingValue=?8,
        cookTime=?9,
        totalTime=?10,
        recipeYield=?11,
        recipeIngredient=?12,
        recipeInstructions=?13,
        authorName=?14,
        publisherName=?15,
        publisherLogo=?16,
        datePublished=?17,
        dateModified=?18
    `)
      .bind(
        recipe.name,
        recipe.description,
        recipe.url || url,
        recipe.image,
        recipe.thumbnailUrl,
        recipe.keywords,
        recipe.aggregateRatingCount,
        recipe.aggregateRatingValue,
        recipe.cookTime,
        recipe.totalTime,
        recipe.recipeYield,
        recipe.recipeIngredient,
        recipe.recipeInstructions,
        recipe.authorName,
        recipe.publisherName,
        recipe.publisherLogo,
        recipe.datePublished,
        recipe.dateModified
      )
      .run()

  } catch(exc) {
    console.error(exc)

    if (exc.cause.message.includes("SqliteError: UNIQUE constraint failed")) {
      console.log(`Recipe with URL of ${url} already exists!`)
    }
  }

  return new Response(JSON.stringify(recipe), { status: 200 })
})

/**
 * @name scrape
 *
 * HTMLRewriter is really meant to stream over a document,
 * and then return "rewritten" HTML. But we can re-purpose
 * it as a parse, by ensuring it's content is consumed,
 * and collecting the pieces of the text (More like innerHTML)
 * of the script tag we're looking for.
 *
 * @param url URL to be scraped
 * @returns The LinkingData found at the URL
 */
const scrape = async (url: string) => {
  let results: string = ""
  const res = await fetch(url)
  console.log("URL to scrape: ", url)

  const htmlRewriter = new HTMLRewriter()
    .on('script[type="application/ld+json"]', {
      text({ text }) {
        results += text
      },
    })

  // Ensure we consume the Response stream so our handler is called.
  await consume(htmlRewriter.transform(res).body)

  // Turned the collected results back into an object
  return JSON.parse(results)
}

const consume = async (stream: ReadableStream) => {
  const reader = stream.getReader()
  while (!(await reader.read()).done) { /* NOOP */}
}

class Recipe {
  aggregateRatingCount: number;
  aggregateRatingValue: number;
  authorName: string;
  cookTime: string;
  dateModified: string;
  datePublished: string;
  description: string;
  image: string;
  keywords: string;
  name: string;
  publisherLogo: string;
  publisherName: string;
  recipeIngredient: string;
  recipeInstructions: string;
  recipeYield: string;
  thumbnailUrl: string;
  totalTime: string;
  url: string;

  constructor(data) {

    // King Arthur Flour nests data under an @graph key
    if (data["@graph"]) {
      data = data["@graph"][0]
    }

    // Required fields
    this.name = data.name
    this.url = data.url

    this.aggregateRatingCount = data.aggregateRating?.ratingCount || null
    this.aggregateRatingValue = data.aggregateRating?.ratingValue || null
    this.authorName = Array.isArray(data.author)
      ? data.author[0].name
      : data.author?.name
      || null
    this.cookTime = data.cookTime || null
    this.dateModified = data.dateModified || null
    this.datePublished = data.datePublished || null
    this.description = data.description || null
    this.image = Array.isArray(data.image)
      ? data.image.find((image) => image.includes("1:1"))
      : data.image?.url
      || null
    this.keywords = Array.isArray(data.keywords)
      ? data.keywords.join(", ")
      : data.keywords
      || null
    this.publisherLogo = data.publisher?.logo?.url || null
    this.publisherName = data.publisher?.name || null
    this.recipeIngredient = data.recipeIngredient.join(" | ") || null
    this.recipeInstructions = Array.isArray(data.recipeInstructions)
      ? data.recipeInstructions.map((step) => JSON.stringify(step)).join(" | ")
      : data.recipeInstructions
      || null
    this.recipeYield = Array.isArray(data.recipeYield)
      ? data.recipeYield.join(", ")
      : data.recipeYield
      || null
    this.thumbnailUrl = data.thumbnailUrl || null
    this.totalTime = data.totalTime || null
  }
}

export default app
