const axios = require('axios')
const glob = require('glob')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const slug = require('slug')
const url = require('url')
const SVGO = require('svgo')

const MAX_FILE_SIZE = 64000
const MAX_WIDTH = 128
const MAX_HEIGHT = 128
const svgo = new SVGO()

const { scrape_wiki } = require('./scrapers/wiki-flags')
const wiki_flags_collection_urls = require('./data/wiki-flags/collection-urls.json')

const download_images = async () => {
  let files = glob.sync("data/*/*.json")
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
  for (const [id, url] of Object.entries(wiki_flags_collection_urls)) {
    await scrape_wiki(url, id)
  }
  // await download_images()
  // await resize_images()
}

main()
