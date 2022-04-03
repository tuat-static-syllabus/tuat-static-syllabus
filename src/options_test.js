const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')

const a =yargs(hideBin(process.argv))
  .parse();
console.log(a);