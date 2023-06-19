import html from './html.js'
import contentTypes from './content-types.js'
import Scraper from './scraper.js'
import { generateJSONResponse, generateErrorJSONResponse } from './json-response.js'

export default {
  fetch(request, env) {
    const searchParams = new URL(request.url).searchParams

    let url = searchParams.get('url')
    if (url && !url.match(/^[a-zA-Z]+:\/\//)) url = 'http://' + url

    const selector = searchParams.get('selector')
    const attr = searchParams.get('attr')
    const spaced = searchParams.get('spaced') // Adds spaces between tags
    const pretty = searchParams.get('pretty')

    if (!url || !selector) {
      return handleSiteRequest(request)
    }

    return handleAPIRequest({ url, selector, attr, spaced, pretty }, env)
  }
}

async function handleSiteRequest(request) {
  const url = new URL(request.url)

  if (url.pathname === '/' || url.pathname === '') {
    return new Response(html, {
      headers: { 'content-type': contentTypes.html }
    })
  }

  return new Response('Not found', { status: 404 })
}

async function handleAPIRequest({ url, selector, attr, spaced, pretty }, env) {
  let scraper, result

  try {
    scraper = await new Scraper().fetch(url)
  } catch (error) {
    return generateErrorJSONResponse(error, pretty)
  }

  try {
    // if (!attr) {
    //   result = await scraper.querySelector(selector).getText({ spaced })
    // } else {
    //   result = await scraper.querySelector(selector).getAttribute(attr)
    // }

    // Assume that by passing the URL into new Scraper(), it knows what site we're on,
    // and thus knows what the relevant scrapers are...
    result = await scraper.scrape()

  } catch (error) {
    return generateErrorJSONResponse(error, pretty)
  }

  try {
    // Save result to KV store, or DB if available?
    await env.DB.prepare('INSERT INTO Recipes (title, excerpt, ingredients_raw, steps_raw, source_url) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(result.title[0], result.excerpt[0], result.ingredients_raw[0], result.steps_raw[0], url)
      .run()

  } catch(exc) {
    console.debug(exc)

    if (exc.cause.message.includes("SqliteError: UNIQUE constraint failed")) {
      console.log(`Recipe with URL of ${url} already exists!`)
    }
  }

  return generateJSONResponse({ result }, pretty)
}
