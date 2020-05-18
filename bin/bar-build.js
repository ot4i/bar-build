#!/usr/bin/env node

/*
Copyright 2020 IBM Corporation
Author John Hosie

  All rights reserved. This program and the accompanying materials
  are made available under the terms of the MIT License
  which accompanies this distribution, and is available at
  http://opensource.org/licenses/MIT

  Contributors:
      John Hosie - initial implementation 
*/

const fs = require('fs')
const path = require('path')
const barGeneration = require('../lib/barGeneration.js')
if(process.argv.length < 4){
  console.log("Must provide the path to the input flow and the output bar file e.g.")
  console.log("npx bar-build ./src/my-cool.flow.yaml ./build/foo.bar")
  process.exit(1)
}
const inputFlow = process.argv[2]
const outputBar = process.argv[3]

if(! fs.existsSync(inputFlow)){
  console.log(`${inputFlow} does not exist`)
  process.exit(1)
}

const outputParentDir = path.dirname(outputBar)

if(! fs.existsSync(outputParentDir)){
  console.log(`${outputParentDir} does not exist`)
  process.exit(1)
}

//console.log(`Compiling ${inputFlow}`)
const inputFlowYaml = fs.readFileSync(inputFlow,{encoding:"utf-8"})
let outputBarStream = fs.createWriteStream(outputBar)
barGeneration.buildBar(outputBarStream,[inputFlowYaml],undefined, undefined, undefined, {})
