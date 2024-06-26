#!/usr/bin/env node

const { ethers } = require('ethers');

const log = require('debug')(`e2e:${require('path').basename(__filename, '.js')}`);

async function getEthBalance({ address }) {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL || 'http://127.0.0.1:8545'
  );

  const balance = parseFloat(ethers.utils.formatUnits(await provider.getBalance(address)));
  log({ wallet: address, balance });

  return balance;
}

module.exports = {
  getEthBalance,
};

if (require.main === module) {
  require('../inspect');
  const [address] = process.argv.slice(2);
  getEthBalance({ address }).then((data) => console.log(JSON.stringify(data, null, 2)));
}
