const axios = require('axios')
const cheerio = require('cheerio')
const glob = require('glob')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const slug = require('slug')
const url = require('url')
const SVGO = require('svgo')

// const ALIASES = require('./aliases.json')
const US_URL = 'https://commons.wikimedia.org/wiki/Flags_of_Native_Americans_in_the_United_States'
const MAX_FILE_SIZE = 64000
const MAX_WIDTH = 128
const MAX_HEIGHT = 128

const svgo = new SVGO()
/*
  This scraper makes a lot of possibly wrong assumptions, like that the
  first link in a description is the tribe name.
*/
const scrape = async () => {
  const response = await axios.get(US_URL)
  const $ = cheerio.load(response.data)

  const $items = $('h3 ~ table td > table, h2 ~ table td > table')
  const data = []

  $items.each((i, elem) => {
    let $elem = $(elem)
    let $img_a = $elem.find('a.image')

    let file_path = $img_a.attr('href').split('/wiki/File:')[1]

    if ( file_path === 'Placeholderflag.png' ) return

    let title = $elem
      .find('tbody tr:nth-child(2) a:nth-child(1)')
      .attr('title')
      .replace('w:', '')

    const item = {
      img_src: `https://www.mediawiki.org/w/index.php?title=Special:Redirect/file/${file_path}`,
      title: title,
      slug: slug(title),
      prefix: 'flag-'
    }

    data.push(item)
  })

  fs.writeFileSync('sources/wiki/us.json', JSON.stringify(data, null, 2))
}

const download_images = async () => {
  let files = glob.sync("sources/*/*.json")
  for (file of files) {
    let data = JSON.parse(fs.readFileSync(file))

    for (item of data) {
      const response = await axios.get(item.img_src, { responseType: 'stream' })
      const ext = path.extname(url.parse(response.request.res.responseUrl).pathname).toLowerCase()
      const out_file = `unprocessed/${item.prefix || ''}${item.slug}${ext || ''}`
      const stream = fs.createWriteStream(out_file)
      response.data.pipe(stream)

      stream.on('finish', async () => {
        if (ext === '.svg') {
          const cleaned = (await svgo.optimize(fs.readFileSync(out_file))).data
          fs.writeFileSync(out_file, cleaned)
        }
      })
    }
  }
}

const resize_images = async () => {
  glob("unprocessed/*", {}, async (er, files) => {
    for (file of files) {
      const ext = path.extname(file)
      const basename = path.basename(file).replace(ext, '')
      let quality = 1.0

      try { 
        let blob = await sharp(file).toBuffer()

        do {
          console.log(basename, ext, file , quality)
          blob = await sharp(blob)
            .resize(MAX_WIDTH, MAX_HEIGHT, {
              fit: sharp.fit.inside,
              withoutEnlargement: true
            })
            .sharpen()
            .png()
          .toBuffer()

          quality -= 0.05;
        } while (quality > 0.4 && blob.size > MAX_FILE_SIZE)

        sharp(blob).toFile(`dist/${basename}.png`)
      } catch ( e ) {
        console.log(`Error processing ${basename}: ${e}`)
      }
    }
  })
}

const main = async () => {
  await scrape()
  await download_images()
  await resize_images()
}

main()