const cleanText = s => s.trim().replace(/\s\s+/g, ' ')

class Scraper {
  constructor() {
    this.rewriter = new HTMLRewriter()
    return this
  }

  async fetch(url) {
    this.url = url
    this.response = await fetch(url)

    const server = this.response.headers.get('server')

    const isThisWorkerErrorNotErrorWithinScrapedSite = (
      [530, 503, 502, 403, 400].includes(this.response.status) &&
      (server === 'cloudflare' || !server /* Workers preview editor */)
    )

    if (isThisWorkerErrorNotErrorWithinScrapedSite) {
      throw new Error(`Status ${ this.response.status } requesting ${ url }`)
    }

    return this
  }

  async scrape() {
    const epicuriousMap = {
      title: "h1",
      excerpt: '[data-testid="BodyWrapper"]',
      ingredients_raw: '[data-testid="IngredientList"]',
      steps_raw: '[data-testid="InstructionsWrapper"]'
    }

    const matches = {}

    Object.entries(epicuriousMap).forEach(([key, selector]) => {
      matches[key] = []

      let nextText = ''

      this.rewriter.on(selector, {
        element(element) {
          matches[key].push(true)
          nextText = ''
        },

        text(text) {
          nextText += text.text

          if (text.lastInTextNode) {
            if (true) nextText += ' '
            matches[key].push(nextText)
            nextText = ''
          }
        }
      })

      return matches
    })

    const transformed = this.rewriter.transform(this.response)

    await transformed.arrayBuffer()

    Object.entries(epicuriousMap).forEach(([key, selector]) => {
      const nodeCompleteTexts = []

      let nextText = ''

      matches[key].forEach(text => {
        if (text === true) {
          if (nextText.trim() !== '') {
            nodeCompleteTexts.push(cleanText(nextText))
            nextText = ''
          }
        } else {
          nextText += text
        }
      })

      const lastText = cleanText(nextText)
      if (lastText !== '') nodeCompleteTexts.push(lastText)
      matches[key] = nodeCompleteTexts
    })

    return matches
  }

  querySelector(selector) {
    this.selector = selector
    return this
  }

  async getText({ spaced }) {
    const matches = {}
    const selectors = new Set(this.selector.split(',').map(s => s.trim()))

    selectors.forEach((selector) => {
      matches[selector] = []

      let nextText = ''

      this.rewriter.on(selector, {
        element(element) {
          matches[selector].push(true)
          nextText = ''
        },

        text(text) {
          nextText += text.text

          if (text.lastInTextNode) {
            if (spaced) nextText += ' '
            matches[selector].push(nextText)
            nextText = ''
          }
        }
      })
    })

    const transformed = this.rewriter.transform(this.response)

    await transformed.arrayBuffer()

    selectors.forEach((selector) => {
      const nodeCompleteTexts = []

      let nextText = ''

      matches[selector].forEach(text => {
        if (text === true) {
          if (nextText.trim() !== '') {
            nodeCompleteTexts.push(cleanText(nextText))
            nextText = ''
          }
        } else {
          nextText += text
        }
      })

      const lastText = cleanText(nextText)
      if (lastText !== '') nodeCompleteTexts.push(lastText)
      matches[selector] = nodeCompleteTexts
    })

    return selectors.length === 1 ? matches[selectors[0]] : matches
  }

  async getAttribute(attribute) {
    class AttributeScraper {
      constructor(attr) {
        this.attr = attr
      }

      element(element) {
        if (this.value) return

        this.value = element.getAttribute(this.attr)
      }
    }

    const scraper = new AttributeScraper(attribute)

    await new HTMLRewriter().on(this.selector, scraper).transform(this.response).arrayBuffer()

    return scraper.value || ''
  }
}

export default Scraper
