import { gameContext } from './gameContext.js';

export function getUpgradeCost(type) {
  const upgrade = gameContext.upgradeState[type];
  return Math.round(upgrade.baseCost * Math.pow(upgrade.costMultiplier, upgrade.level));
}

export function getUpgradeBonus(type) {
  const upgrade = gameContext.upgradeState[type];
  if (type === 'turret' || type === 'missileTurret') {
    return `+${upgrade.bonus} damage`;
  } else if (type === 'hydroElectric') {
    return `+${Math.round(upgrade.bonus * 100)}% hydro rate`;
  } else {
    return `+${Math.round(upgrade.bonus * 100)}% energy`;
  }
}
