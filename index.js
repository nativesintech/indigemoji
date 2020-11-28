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

const { scrape_wikis_by_id } = require('./scrapers/wiki-flags')

const download_images = async () => {
  let files = glob.sync('data/*/*.json')
  for (file of files) {
    let data = JSON.parse(fs.readFileSync(file))

    for (item of data) {
      const response = await axios.get(item.img_src, { responseType: 'stream' })
      const ext = path
        .extname(url.parse(response.request.res.responseUrl).pathname)
        .toLowerCase()
      const out_file = `unprocessed/${item.slug}${ext || ''}`
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
  glob('unprocessed/*', {}, async (er, files) => {
    for (file of files) {
      const ext = path.extname(file)
      const basename = path.basename(file).replace(ext, '')
      let quality = 1.0

      try {
        let blob = await sharp(file).toBuffer()

        do {
          console.log(basename, ext, file, quality)
          blob = await sharp(blob)
            .resize(MAX_WIDTH, MAX_HEIGHT, {
              fit: sharp.fit.inside,
              withoutEnlargement: true
            })
            .sharpen()
            .png()
            .toBuffer()

          quality -= 0.05
        } while (quality > 0.4 && blob.size > MAX_FILE_SIZE)

        sharp(blob).toFile(`dist/${basename}.png`)
      } catch (e) {
        console.log(`Error processing ${basename}: ${e}`)
      }
    }
  })
}

require('yargs')
  .scriptName('indigemoji')
  .usage('$0 <cmd> [args]')
  .option('verbose', { type: 'boolean' })
  .command(
    'all',
    'Perform all tasks (scraping, downloading, and processing images).',
    async () => {
      await scrape_wikis_by_id()
      await download_images()
      await resize_images()
    }
  )
  .command(
    'scrape wiki-flags',
    'Scrape indigenous flag image URLs from wikipedia and write them to `data/`.',
    (yargs) => {
      const argv = yargs.option('id', {
        type: 'array',
        describe:
          'List of space-separated IDs from `data/wiki-flags/collection-urls`.' +
          'If no value is specified, all URLs will be scraped.'
      })
    },
    (argv) => scrape_wikis_by_id(argv.ids)
  )
  .command(
    'download',
    'Download all images in the `data/` directory by URL to the `unprocessed/` directory.',
    download_images
  )
  .command(
    'resize',
    'Resize all images in the `unprocessed/` and ouput them to the `dist/` directory.',
    resize_images
  )
  .help().argv
