#!/usr/bin/env node

require('./inspect');

const path = require('path');
const fs = require('fs/promises');
const { ethers } = require('ethers');

const fgReset = '\x1b[0m';
const fgRed = '\x1b[31m';
const fgGreen = '\x1b[32m';
const fgCyan = '\x1b[36m';

const ERC20Abi = [
  'constructor(string name, string symbol, uint256 initialSupply) payable',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)',
  'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
  'function mint(uint256 amount, address to)',
  'function name() view returns (string)',
  'function owner() view returns (address)',
  'function renounceOwnership()',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function transferOwnership(address newOwner)',
];

const log = require('debug')(`e2e:${require('path').basename(__filename, '.js')}`);

const [cannonState] = process.argv.slice(2);
if (!cannonState) {
  console.error(`${fgRed}ERROR: Expected 1 argument${fgReset}`);
  console.error(`Usage: ${fgGreen}node e2e/generateDeployments ${fgCyan}cannonState${fgReset}`);
  console.error(
    `Example: ${fgGreen}node e2e/generateDeployments ${fgCyan}/tmp/cannonState.json${fgReset}`
  );
  process.exit(1);
}

function readableAbi(abi) {
  return new ethers.utils.Interface(abi).format(ethers.utils.FormatTypes.full);
}

function jsonAbi(abi) {
  return JSON.parse(new ethers.utils.Interface(abi).format(ethers.utils.FormatTypes.json));
}

async function run() {
  const deployments = require(path.resolve(cannonState));

  await fs.rm(`${__dirname}/deployments`, { recursive: true, force: true });
  await fs.mkdir(`${__dirname}/deployments`, { recursive: true });
  await fs.mkdir(`${__dirname}/deployments/abi`, { recursive: true });

  const meta = {
    chainId: deployments.chainId,
    name: deployments.def.name,
    preset: deployments.def.preset ?? 'main',
    version: deployments.def.version,
    generator: deployments.generator,
    timestamp: deployments.timestamp,
    miscUrl: deployments.miscUrl,
  };
  const extras = {};
  log('Generating deployments info for', meta);

  const system = deployments.state['provision.system'].artifacts.imports.system;
  const contracts = {};
  contracts.CoreProxy = system.contracts.CoreProxy;
  contracts.AccountProxy = system.contracts.AccountProxy;
  contracts.USDProxy = system.contracts.USDProxy;
  contracts.OracleManagerProxy = system.imports.oracle_manager.contracts.Proxy;

  if (deployments.state['provision.legacyMarket']) {
    contracts.LegacyMarketProxy =
      deployments.state['provision.legacyMarket'].artifacts.imports.legacyMarket.contracts.Proxy;
    contracts.V2x =
      deployments.state[
        'provision.legacyMarket'
      ].artifacts.imports.legacyMarket.imports.v2x.contracts.Synthetix;
  }

  const trustedMulticallForwarder = system?.imports?.trusted_multicall_forwarder;
  if (trustedMulticallForwarder) {
    contracts.TrustedMulticallForwarder =
      trustedMulticallForwarder.contracts.TrustedMulticallForwarder;
  }

  const spotFactory =
    deployments?.state?.['provision.spotFactory']?.artifacts?.imports?.spotFactory;
  if (spotFactory) {
    contracts.SpotMarketProxy = spotFactory.contracts.SpotMarketProxy;
  }

  const perpsFactory =
    deployments?.state?.['provision.perpsFactory']?.artifacts?.imports?.perpsFactory;
  if (perpsFactory) {
    contracts.PerpsMarketProxy = perpsFactory.contracts.PerpsMarketProxy;
    contracts.PerpsAccountProxy =
      perpsFactory.contracts.PerpsAccountProxy ?? perpsFactory.contracts.AccountProxy;
  }

  const snxRewards =
    deployments?.state?.[`provision.stp_14_spartan_council_pool_snx_rewards`]?.artifacts?.imports
      ?.stp_14_spartan_council_pool_snx_rewards ??
    deployments?.state?.[`provision.spartan_council_pool_rewards`]?.artifacts?.imports
      ?.spartan_council_pool_rewards;
  if (snxRewards) {
    contracts[`RewardsDistributorForSpartanCouncilPoolSNX`] =
      snxRewards.contracts.RewardsDistributor;
  }

  const usdcRewards =
    deployments?.state?.[`provision.sccp_313_spartan_council_pool_usdc_rewards`]?.artifacts?.imports
      ?.sccp_313_spartan_council_pool_usdc_rewards;
  if (usdcRewards) {
    contracts[`RewardsDistributorForSpartanCouncilPoolUSDC`] =
      usdcRewards.contracts.RewardsDistributor;
  }

  const bfp_market_factory =
    deployments?.state?.['provision.bfp_market_factory']?.artifacts?.imports?.bfp_market_factory;
  if (bfp_market_factory) {
    contracts.BfpMarketProxy = bfp_market_factory.contracts.BfpMarketProxy;
    contracts.PerpAccountProxy = bfp_market_factory.contracts.PerpAccountProxy;
    contracts.PerpRewardDistributor = bfp_market_factory.contracts.PerpRewardDistributor;
  }

  const pyth_erc7412_wrapper =
    deployments?.state?.['provision.pyth_erc7412_wrapper']?.artifacts?.imports
      ?.pyth_erc7412_wrapper;
  if (pyth_erc7412_wrapper) {
    contracts.PythERC7412Wrapper = pyth_erc7412_wrapper.contracts.PythERC7412Wrapper;
  }

  function mintableToken(provisionStep) {
    const fakeCollateral =
      deployments?.state?.[`provision.${provisionStep}`]?.artifacts?.imports?.[provisionStep];
    const fakeCollateralOptions = deployments?.def?.provision?.[provisionStep]?.options;
    if (fakeCollateral && fakeCollateralOptions) {
      contracts[`FakeCollateral${fakeCollateralOptions.symbol}`] =
        fakeCollateral.contracts.MintableToken;
    }
  }
  mintableToken('snx_mock_collateral');
  mintableToken('usdc_mock_collateral');
  mintableToken('mintableToken');
  mintableToken('dai_mock_collateral');
  mintableToken('arb_mock_collateral');
  mintableToken('weth_mock_collateral');
  mintableToken('wbtc_mock_collateral');

  function erc20(contractName, address) {
    if (address) {
      contracts[contractName] = { address, abi: ERC20Abi };
    }
  }

  // Extract all extras
  Object.values(deployments?.state).forEach((step) => {
    Object.assign(extras, step?.artifacts?.settings);
    Object.assign(extras, step?.artifacts?.extras);
  });

  erc20('USDCToken', extras?.usdc_address ?? deployments?.def?.setting?.usdc_address?.defaultValue);
  erc20('SNXToken', extras?.snx_address ?? deployments?.def?.setting?.snx_address?.defaultValue);
  erc20('ARBToken', extras?.arb_address);
  erc20('DAIToken', extras?.dai_address);
  erc20('WETHToken', extras?.weth_address);
  erc20('WBTCToken', extras?.wbtc_address);

  erc20('SynthBTCToken', extras.synth_btc_token_address);
  erc20('SynthETHToken', extras.synth_eth_token_address);
  erc20('SynthSNXToken', extras.synth_snx_token_address);
  erc20('SynthUSDCToken', extras.synth_usdc_token_address);
  erc20('SynthOPToken', extras.synth_op_token_address);
  erc20('SynthLINKToken', extras.synth_link_token_address);
  erc20('SynthDAIToken', extras.synth_dai_token_address);

  Object.assign(meta, {
    contracts: Object.fromEntries(
      Object.entries(contracts).map(([name, { address }]) => [name, address])
    ),
  });

  contracts.AllErrors = {
    address: ethers.constants.AddressZero,
    abi: Array.from(
      new Set(
        Object.values(contracts)
          .flatMap(({ abi }) => abi.filter((item) => item.type === 'error'))
          .map((item) => JSON.stringify(item))
      )
    ).map((item) => JSON.parse(item)),
  };

  log('Writing', `deployments/meta.json`);
  await fs.writeFile(`${__dirname}/deployments/meta.json`, JSON.stringify(meta, null, 2));

  log('Writing', `deployments/extras.json`);
  await fs.writeFile(`${__dirname}/deployments/extras.json`, JSON.stringify(extras, null, 2));

  await fs.writeFile(
    `${__dirname}/deployments/cannon.json`,
    JSON.stringify(
      deployments,
      (key, value) => {
        if (key === 'abi' && Array.isArray(value)) {
          return readableAbi(value);
        }
        if (key === 'depends' && Array.isArray(value)) {
          return Array.from(new Set(value)).sort();
        }
        return value;
      },
      2
    )
  );

  for (const [name, { address, abi }] of Object.entries(contracts)) {
    log('Writing', `deployments/${name}.json`, { address });
    await fs.writeFile(
      `${__dirname}/deployments/${name}.json`,
      JSON.stringify({ address, abi: readableAbi(abi) }, null, 2)
    );
  }

  for (const [name, { abi }] of Object.entries(contracts)) {
    log('Writing', `deployments/abi/${name}.json`);
    await fs.writeFile(
      `${__dirname}/deployments/abi/${name}.json`,
      JSON.stringify(jsonAbi(abi), null, 2)
    );
    log('Writing', `deployments/abi/${name}.readable.json`);
    await fs.writeFile(
      `${__dirname}/deployments/abi/${name}.readable.json`,
      JSON.stringify(readableAbi(abi), null, 2)
    );
  }
}

run();
