# MtG Sideboard Guide generator

**Live app: <https://dgmora.github.io/MtG-Sideboard-Guides/>**

Turns a sideboard guide kept in Google Sheets into a card you can print and keep in your deck box.

![example guide](./img/example_guide.png "Example Guide")

## How it works

Keep one spreadsheet with a tab per deck, named after the deck. Start from the template linked on the page, share the spreadsheet as "Anyone with the link can view" and add its link: every tab becomes a guide. Edit the sheet, come back, and the card updates. You can also paste a sheet or CSV directly.

Each half of the guide is a 63 × 88 mm Magic card. Red numbers are cards to take out, green ones cards to bring in, and a `*` marks optional swaps. Guides with many matchups fold into two halves. Download the SVG and print it at 100% scale.

Already have a guide in another format? The page has a prompt you can give an AI assistant like Claude or ChatGPT to convert it, along with your decklist.

Everything runs in your browser. Your spreadsheet is never sent anywhere else, and the page only remembers your links on your device. You can share a guide as a live link to your spreadsheet or as a snapshot stored in the link itself.

## Local development

The app is plain HTML, CSS and JavaScript in `web/`, with no build step. Serve the repository and open <http://localhost:8000/web/>:

```sh
python3 -m http.server
```

Run the tests with Node:

```sh
node web/guide.test.js
```

## Contributing

Ideas, questions and feedback are best started in [Discussions](https://github.com/dgmora/MtG-Sideboard-Guides/discussions). Issues and pull requests are welcome too.

## Attribution

Inspired by and originally based on [sepro/MtG-Sideboard-Guides](https://github.com/sepro/MtG-Sideboard-Guides) by Sebastian Proost, which this project started as a fork of.
