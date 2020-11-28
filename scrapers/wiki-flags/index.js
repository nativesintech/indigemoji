const axios = require('axios')
const cheerio = require('cheerio')
const slug = require('slug')
const fs = require('fs')
const wiki_collection_urls = require('./collection-urls.json')

/* 
  Scrape a wikipedia page for flags. This scraper makes a lot of possibly wrong
  assumptions, like that the first link in a description is the tribe name.
*/
const scrape_wiki = async (url, out_path) => {
  const response = await axios.get(url)
  const $ = cheerio.load(response.data)

  const $items = $('h3 ~ table td > table, h2 ~ table td > table')
  const data = []

  $items.each((i, elem) => {
    let $elem = $(elem)
    let $img_a = $elem.find('a.image')

    let file_path = $img_a.attr('href').split('/wiki/File:')[1]

    if (file_path === 'Placeholderflag.png') return

    let title
    let link = $elem.find('tbody tr:nth-child(2) a:nth-child(1)')

    if (link.length) {
      title = link.attr('title').split(':').pop()
    } else {
      title = $elem.find('tbody tr:nth-child(2)').text().split(',').shift()
    }

    const item = {
      img_src: `https://www.mediawiki.org/w/index.php?title=Special:Redirect/file/${file_path}`,
      title: title,
      slug: slug(title).replace('flag-', ''),
      prefix: 'flag-'
    }

    data.push(item)
  })

  fs.writeFileSync(
    `data/wiki-flags/${out_path}.json`,
    JSON.stringify(data, null, 2)
  )
}

const scrape_wikis_by_id = async (ids=Object.keys(wiki_collection_urls)) => {
  for (const id of ids) {
    const url = wiki_collection_urls[id]
    await scrape_wiki(url, id)
  }
}


module.exports = { scrape_wiki, scrape_wikis_by_id }
