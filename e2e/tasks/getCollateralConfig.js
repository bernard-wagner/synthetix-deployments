const { ethers } = require('ethers');
const CoreProxy = require('../deployments/CoreProxy.json');

async function getCollateralConfig(symbol) {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL || 'http://127.0.0.1:8545'
  );

  const coreProxy = new ethers.Contract(CoreProxy.address, CoreProxy.abi, provider);
  const collateralConfigs = await coreProxy.getCollateralConfigurations(true);
  for (const config of collateralConfigs) {
    try {
      const contract = new ethers.Contract(
        config.tokenAddress,
        ['function symbol() view returns (string)'],
        provider
      );
      const collateralSymbol = await contract.symbol();
      if (collateralSymbol === symbol) {
        return config;
      }
    } catch (e) {
      // nevermind
    }
  }
  throw new Error(`Collateral config for "${symbol}" does not exist`);
}

module.exports = {
  getCollateralConfig,
};
