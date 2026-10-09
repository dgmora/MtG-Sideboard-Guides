// Run with: node web/guide.test.js
const assert = require('node:assert');
const { parseData, getDecks, buildPivot, unbalanced, generateCardSVG, sheetId, parseTabs, decodeBase64 } = require('./guide.js');

const matrix = [
  'md\tsb\tCard\tStasis\tElves\t\tGoblins',
  '1\t2\tAbeyance\t2\t\t\t-1',
  '4\t\tSwords to Plowshares\t-4',
  '\t4\tMeddling Mage\t+2*\t\t\t1',
  '\t\tTotal\t0\t\t0',
].join('\n');

const records = parseData(matrix);
assert.deepStrictEqual(getDecks(records), ['']);

const pivot = buildPivot(records, '');
assert.deepStrictEqual(pivot.faces, [['Stasis', 'Elves'], ['Goblins']]);
assert.deepStrictEqual(pivot.cards, ['1 Abeyance', '4 Swords to Plowshares', '2 Abeyance', '4 Meddling Mage']);
assert.strictEqual(pivot.firstSideboard, 2);
assert.deepStrictEqual(pivot.data.Stasis, {
  '2 Abeyance': '+2', '4 Swords to Plowshares': '-4', '4 Meddling Mage': '+2*',
});
assert.deepStrictEqual(pivot.data.Goblins, { '1 Abeyance': '-1', '4 Meddling Mage': '+1' });

assert.deepStrictEqual(unbalanced(records, ''), []);
assert.deepStrictEqual(unbalanced(parseData('md\tsb\tX\tElves\tAluren\n4\t\tIsland\t-1\t+1'), ''), ['Aluren +1']);

const long = parseData('deck\topponent\tcard\tmaindeck\tdelta\nDnT\tDelver\tPath\t0\t+1');
assert.deepStrictEqual(buildPivot(long, 'DnT').cards, ['Path']);

const csv = [
  'md,sb,Card,Stasis,Elves,,Goblins',
  '1,2,Abeyance,2,,,-1',
  '4,,Swords to Plowshares,-4',
  ',4,Meddling Mage,+2*,,,1',
  ',,,,,,',
  ',,Total,"=SUM(D2:D4,0)",,"=SUM(F2:F4,0)"',
].join('\r\n');
assert.deepStrictEqual(parseData(csv), records);

const quoted = parseData('md,sb,X,Elves\n1,,"Jace, the Mind Sculptor",-1');
assert.deepStrictEqual(buildPivot(quoted, '').cards, ['1 Jace, the Mind Sculptor']);

const pastedWithQuotes = parseData('md\tsb\tX\tElves\n1\t\t"Say ""Hi""\nTwice"\t-1');
assert.deepStrictEqual(buildPivot(pastedWithQuotes, '').cards, ['1 Say "Hi"\nTwice']);

const blankRowSplit = buildPivot(parseData([
  'md\tsb\tCard\tElves',
  '4\t\tIsland\t-2',
  '\t\t\t',
  '2\t\tExalted Angel\t2',
].join('\n')), '');
assert.deepStrictEqual(blankRowSplit.cards, ['4 Island', '2 Exalted Angel']);
assert.strictEqual(blankRowSplit.firstSideboard, 1);

const manyOpponents = Array.from({ length: 12 }, (_, i) => `Opp ${i}`);
const wide = buildPivot(parseData(`md\tsb\tCard\t${manyOpponents.join('\t')}\n4\t\tIsland\t-1`), '');
assert.deepStrictEqual(wide.faces, [manyOpponents.slice(0, 6), manyOpponents.slice(6)]);

const single = buildPivot(parseData('md\tsb\tCard\tElves\n4\t\tIsland\t-1'), '');
const singleSVG = generateCardSVG('', single.cards, single.faces, single.data, single.firstSideboard);
assert.match(singleSVG, /width="63mm"/);
assert.match(singleSVG, />Total</);
assert.match(generateCardSVG('DnT', single.cards, single.faces, single.data, -1), />DnT</);

assert.strictEqual(sheetId('https://docs.google.com/spreadsheets/d/1Bx-i_9/edit#gid=12'), '1Bx-i_9');
assert.strictEqual(sheetId('https://example.com/d/1Bx'), null);

const htmlview = [
  'var items = [];',
  'items.push({name: "Death \\x26 Taxes", pageUrl: "https:\\/\\/docs.google.com\\/x?headers\\x3dtrue&gid=0", gid: "0",initialSheet: ("0" == gid)});',
  'items.push({name: "Sneak \\"n\\" Show \\u00e9", pageUrl: "https:\\/\\/docs.google.com\\/x?gid=77", gid: "77",initialSheet: ("77" == gid)});',
].join('');
assert.deepStrictEqual(parseTabs(htmlview), [
  { name: 'Death & Taxes', gid: '0' },
  { name: 'Sneak "n" Show é', gid: '77' },
]);
assert.deepStrictEqual(parseTabs('<html></html>'), []);

const sharedGuide = 'md,sb,Card,Elves\n4,,Æther Vial,-1*';
assert.strictEqual(decodeBase64(Buffer.from(sharedGuide).toString('base64')), sharedGuide);
assert.strictEqual(decodeBase64(new URLSearchParams('paste=Pj4+Pw==').get('paste')), '>>>?');
assert.strictEqual(decodeBase64('Pj4-Pw'), '>>>?');
assert.throws(() => decodeBase64('not base64!'));

console.log('ok');
