const args = process.argv.slice(2);

let tilesFolder = args[0];
let examinationPagesFolder = args[1];

console.log('arguments: ' + args);

produce(tilesFolder, examinationPagesFolder).then(() => {});
