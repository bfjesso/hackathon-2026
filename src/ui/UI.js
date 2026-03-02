import * as THREE from 'three';
import { gameContext } from '../game/gameContext.js';
import { getUpgradeCost, getUpgradeBonus } from '../game/upgradeUtils.js';
import { applyUpgradeToBuildings } from '../entities/Building.js';
import { updateGridRings } from '../systems/GridSystem.js';

export const ui = {
  container: null,
  healthDisplay: null,
  energyDisplay: null,
  energyRateDisplay: null,
  roundDisplay: null,
  zombiesDisplay: null,
  timerDisplay: null,
  buildModeIndicator: null,
  powerUpModeIndicator: null,
  upgradeModeIndicator: null,
  buildMenu: null,
  powerUpMenu: null,
  upgradeMenu: null,
  activeBuffBar: null,
  upgradeButtons: {},
  powerUpTooltip: null,
  upgradeTooltip: null,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'game-ui';
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0;
      padding: 10px 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      pointer-events: none;
      font-family: 'Segoe UI', Arial, sans-serif;
      z-index: 100;
    `;
    document.body.appendChild(this.container);

    // Stats panel (left side)
    const statsPanel = document.createElement('div');
    statsPanel.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      padding: 15px 20px;
      border-radius: 10px;
      color: white;
      pointer-events: auto;
    `;

    this.healthDisplay = document.createElement('div');
    this.healthDisplay.style.cssText = 'font-size: 18px; color: #ff6b6b; margin-bottom: 5px;';

    this.energyDisplay = document.createElement('div');
    this.energyDisplay.style.cssText = 'font-size: 18px; color: #4ecdc4; margin-bottom: 2px;';

    this.energyRateDisplay = document.createElement('div');
    this.energyRateDisplay.style.cssText = 'font-size: 13px; color: #3ba89f; margin-bottom: 10px;';

    const roundSection = document.createElement('div');
    roundSection.style.cssText = 'border-top: 1px solid #444; padding-top: 10px; margin-top: 5px;';

    this.roundDisplay = document.createElement('div');
    this.roundDisplay.style.cssText = 'font-size: 20px; color: #ffd700; font-weight: bold; margin-bottom: 5px;';

    this.zombiesDisplay = document.createElement('div');
    this.zombiesDisplay.style.cssText = 'font-size: 16px; color: #ff9999; margin-bottom: 3px;';

    this.timerDisplay = document.createElement('div');
    this.timerDisplay.style.cssText = 'font-size: 16px; color: #99ccff; margin-bottom: 10px;';

    roundSection.appendChild(this.roundDisplay);
    roundSection.appendChild(this.zombiesDisplay);
    roundSection.appendChild(this.timerDisplay);

    this.buildModeIndicator = document.createElement('div');
    this.buildModeIndicator.style.cssText = 'font-size: 14px; color: #888; margin-top: 5px; padding-top: 10px; border-top: 1px solid #444;';
    this.buildModeIndicator.textContent = '[B] Build Mode';

    this.powerUpModeIndicator = document.createElement('div');
    this.powerUpModeIndicator.style.cssText = 'font-size: 14px; color: #888; margin-top: 5px;';
    this.powerUpModeIndicator.textContent = '[P] Power Ups';

    this.upgradeModeIndicator = document.createElement('div');
    this.upgradeModeIndicator.style.cssText = 'font-size: 14px; color: #888; margin-top: 5px;';
    this.upgradeModeIndicator.textContent = '[U] Upgrades';

    statsPanel.appendChild(this.healthDisplay);
    statsPanel.appendChild(this.energyDisplay);
    statsPanel.appendChild(this.energyRateDisplay);
    statsPanel.appendChild(roundSection);
    statsPanel.appendChild(this.buildModeIndicator);
    statsPanel.appendChild(this.powerUpModeIndicator);
    statsPanel.appendChild(this.upgradeModeIndicator);
    this.container.appendChild(statsPanel);

    // Active buff bar (top center)
    this.activeBuffBar = document.createElement('div');
    this.activeBuffBar.style.cssText = `
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      z-index: 200;
      pointer-events: none;
    `;
    document.body.appendChild(this.activeBuffBar);

    this._initBuildMenu();
    this._initPowerUpMenu();
    this._initUpgradeMenu();

    this.update();
  },

  _initBuildMenu() {
    this.buildMenu = document.createElement('div');
    this.buildMenu.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 30, 40, 0.92), rgba(10, 18, 28, 0.95));
      padding: 18px;
      border-radius: 6px;
      color: white;
      pointer-events: auto;
      display: none;
      border: 1px solid #4ecdc4;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-family: 'Segoe UI', Arial, sans-serif;
      overflow: visible;
      position: relative;
    `;

    const menuTitle = document.createElement('div');
    menuTitle.textContent = 'BUILD';
    menuTitle.style.cssText = 'font-size: 16px; margin-bottom: 12px; text-align: center; color: #4ecdc4; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;';
    this.buildMenu.appendChild(menuTitle);

    const buildingTypes = [
      { key: 'windTurbine',    name: 'Wind Turbine',   cost: 100,  hotkey: '1', desc: 'Generates energy from wind' },
      { key: 'solarPanel',    name: 'Solar Panel',    cost: 250,  hotkey: '2', desc: 'Generates energy from sunlight' },
      { key: 'powerPlant',    name: 'Power Plant',    cost: 500,  hotkey: '3', desc: 'High output energy generator' },
      { key: 'turret',        name: 'Turret',         cost: 400,  hotkey: '4', desc: 'Shoots nearby zombies' },
      { key: 'missileTurret', name: 'Missile Turret', cost: 800,  hotkey: '5', desc: 'Splash damage missiles' },
    ];

    buildingTypes.forEach(building => {
      const btn = document.createElement('button');
      btn.innerHTML = `<span style="opacity:0.5;margin-right:6px;">${building.hotkey}</span> ${building.name} <span style="float:right;color:#4ecdc4;">${building.cost}</span>`;
      btn.dataset.buildingType = building.key;
      btn.dataset.cost = building.cost;
      btn.style.cssText = `
        display: block; width: 100%; padding: 8px 12px; margin-bottom: 4px;
        background: rgba(78, 205, 196, 0.15); border: 1px solid rgba(78, 205, 196, 0.3);
        color: #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif; text-align: left; transition: background 0.15s;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(78, 205, 196, 0.35)'; btn.style.color = '#fff'; });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(78, 205, 196, 0.15)'; btn.style.color = '#ccc';
        btn.style.borderColor = gameContext.selectedBuilding === building.key ? '#ffd700' : 'rgba(78, 205, 196, 0.3)';
      });
      btn.addEventListener('click', () => this.selectBuilding(building.key, building.cost));
      this.buildMenu.appendChild(btn);
    });

    const destroyBtn = document.createElement('button');
    destroyBtn.id = 'destroy-btn';
    destroyBtn.innerHTML = `<span style="opacity:0.5;margin-right:6px;">X</span> Destroy`;
    destroyBtn.style.cssText = `
      display: block; width: 100%; padding: 8px 12px; margin-top: 8px;
      background: rgba(255, 60, 60, 0.15); border: 1px solid rgba(255, 60, 60, 0.3);
      color: #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;
      font-family: 'Segoe UI', Arial, sans-serif; text-align: left; transition: background 0.15s;
    `;
    destroyBtn.addEventListener('mouseenter', () => { destroyBtn.style.background = 'rgba(255, 60, 60, 0.35)'; destroyBtn.style.color = '#fff'; });
    destroyBtn.addEventListener('mouseleave', () => {
      destroyBtn.style.background = gameContext.destroyMode ? 'rgba(255, 60, 60, 0.35)' : 'rgba(255, 60, 60, 0.15)';
      destroyBtn.style.color = gameContext.destroyMode ? '#fff' : '#ccc';
      destroyBtn.style.borderColor = gameContext.destroyMode ? '#ff3c3c' : 'rgba(255, 60, 60, 0.3)';
    });
    destroyBtn.addEventListener('click', () => this.toggleDestroyMode());
    this.buildMenu.appendChild(destroyBtn);

    this.container.appendChild(this.buildMenu);
  },

  _initPowerUpMenu() {
    this.powerUpMenu = document.createElement('div');
    this.powerUpMenu.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 30, 20, 0.92), rgba(10, 18, 10, 0.95));
      padding: 18px; border-radius: 6px; color: white; pointer-events: auto;
      display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      min-width: 300px; border: 1px solid #2e8b57; box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-family: 'Segoe UI', Arial, sans-serif; overflow: visible;
    `;

    const powerUpTitle = document.createElement('div');
    powerUpTitle.textContent = 'POWER UPS';
    powerUpTitle.style.cssText = 'font-size: 16px; margin-bottom: 12px; text-align: center; color: #5dde8e; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;';
    this.powerUpMenu.appendChild(powerUpTitle);

    const powerUps = [
      { key: 'shield',    name: 'Shield',     cost: 500, hotkey: '1', desc: 'Protects player and buildings for 10 seconds (45s cooldown)' },
      { key: 'instaKill', name: 'Insta Kill', cost: 750, hotkey: '2', desc: 'Sets all zombies to 1 HP for 10 seconds (60s cooldown)' },
      { key: 'surge',     name: 'Surge',      cost: 400, hotkey: '3', desc: 'Doubles energy generation for 10 seconds (30s cooldown)' },
    ];

    this.powerUpTooltip = document.createElement('div');
    this.powerUpTooltip.style.cssText = `
      position: absolute; left: calc(100% + 10px); top: 0;
      background: linear-gradient(135deg, rgba(15, 25, 15, 0.95), rgba(8, 14, 8, 0.97));
      border: 1px solid #2e8b57; border-radius: 4px; padding: 10px 14px;
      color: #ddd; font-size: 12px; min-width: 180px; pointer-events: none;
      display: none; box-shadow: 0 3px 12px rgba(0,0,0,0.5); font-family: 'Segoe UI', Arial, sans-serif;
      line-height: 1.5; z-index: 10;
    `;
    this.powerUpMenu.style.position = 'fixed';
    this.powerUpMenu.appendChild(this.powerUpTooltip);

    powerUps.forEach(powerUp => {
      const btn = document.createElement('button');
      btn.innerHTML = `<span style="opacity:0.5;margin-right:6px;">${powerUp.hotkey}</span> ${powerUp.name} <span style="float:right;color:#5dde8e;">${powerUp.cost}</span>`;
      btn.dataset.powerUpType = powerUp.key;
      btn.dataset.cost = powerUp.cost;
      btn.style.cssText = `
        display: block; width: 100%; padding: 8px 12px; margin-bottom: 4px;
        background: rgba(46, 139, 87, 0.15); border: 1px solid rgba(46, 139, 87, 0.3);
        color: #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif; text-align: left;
        transition: background 0.15s; position: relative; overflow: hidden;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(46, 139, 87, 0.35)'; btn.style.color = '#fff';
        this.powerUpTooltip.innerHTML = `<div style="color:#5dde8e;font-weight:bold;margin-bottom:4px;">${powerUp.name}</div><div style="margin-bottom:6px;">${powerUp.desc}</div><div style="color:#5dde8e;">Cost: ${powerUp.cost} Joules</div>`;
        this.powerUpTooltip.style.display = 'block';
        const menuRect = this.powerUpMenu.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        this.powerUpTooltip.style.top = (btnRect.top - menuRect.top) + 'px';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(46, 139, 87, 0.15)'; btn.style.color = '#ccc';
        this.powerUpTooltip.style.display = 'none';
      });
      btn.addEventListener('click', () => this.buyPowerUp(powerUp.key, powerUp.cost));
      this.powerUpMenu.appendChild(btn);
    });

    const closeHint = document.createElement('div');
    closeHint.textContent = '[P] or [Esc] to close';
    closeHint.style.cssText = 'font-size: 10px; text-align: center; opacity: 0.35; margin-top: 10px;';
    this.powerUpMenu.appendChild(closeHint);
    document.body.appendChild(this.powerUpMenu);
  },

  _initUpgradeMenu() {
    this.upgradeMenu = document.createElement('div');
    this.upgradeMenu.style.cssText = `
      background: linear-gradient(135deg, rgba(30, 20, 10, 0.92), rgba(18, 12, 6, 0.95));
      padding: 18px; border-radius: 6px; color: white; pointer-events: auto;
      display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      min-width: 320px; border: 1px solid #b8860b; box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-family: 'Segoe UI', Arial, sans-serif; overflow: visible;
    `;

    const upgradeTitle = document.createElement('div');
    upgradeTitle.textContent = 'UPGRADES';
    upgradeTitle.style.cssText = 'font-size: 16px; margin-bottom: 12px; text-align: center; color: #daa520; font-weight: bold; letter-spacing: 3px; text-transform: uppercase;';
    this.upgradeMenu.appendChild(upgradeTitle);

    this.upgradeTooltip = document.createElement('div');
    this.upgradeTooltip.style.cssText = `
      position: absolute; left: calc(100% + 10px); top: 0;
      background: linear-gradient(135deg, rgba(25, 18, 8, 0.95), rgba(14, 10, 4, 0.97));
      border: 1px solid #b8860b; border-radius: 4px; padding: 10px 14px;
      color: #ddd; font-size: 12px; min-width: 180px; pointer-events: none;
      display: none; box-shadow: 0 3px 12px rgba(0,0,0,0.5); font-family: 'Segoe UI', Arial, sans-serif;
      line-height: 1.5; z-index: 10;
    `;
    this.upgradeMenu.appendChild(this.upgradeTooltip);

    const upgradeTypes = [
      { key: 'windTurbine',    name: 'Wind Turbine',   hotkey: '1', desc: 'Increases energy generation of all Wind Turbines' },
      { key: 'solarPanel',    name: 'Solar Panel',    hotkey: '2', desc: 'Increases energy generation of all Solar Panels' },
      { key: 'powerPlant',    name: 'Power Plant',    hotkey: '3', desc: 'Increases energy generation of all Power Plants' },
      { key: 'turret',        name: 'Turret',         hotkey: '4', desc: 'Increases damage of all Turrets' },
      { key: 'missileTurret', name: 'Missile Turret', hotkey: '5', desc: 'Increases damage of all Missile Turrets' },
      { key: 'hydroElectric', name: 'Hydro Dam',      hotkey: '6', desc: 'Increases passive hydroelectric energy income' },
    ];

    this.upgradeButtons = {};
    upgradeTypes.forEach(upgrade => {
      const btn = document.createElement('button');
      btn.dataset.upgradeType = upgrade.key;
      this.upgradeButtons[upgrade.key] = btn;
      this.updateUpgradeButton(btn, upgrade);

      btn.style.cssText = `
        display: block; width: 100%; padding: 8px 12px; margin-bottom: 4px;
        background: rgba(184, 134, 11, 0.15); border: 1px solid rgba(184, 134, 11, 0.3);
        color: #ccc; border-radius: 4px; cursor: pointer; font-size: 13px;
        font-family: 'Segoe UI', Arial, sans-serif; text-align: left;
        transition: background 0.15s; position: relative; overflow: hidden;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(184, 134, 11, 0.35)'; btn.style.color = '#fff';
        const cost = getUpgradeCost(upgrade.key);
        const bonus = getUpgradeBonus(upgrade.key);
        const level = gameContext.upgradeState[upgrade.key].level;
        this.upgradeTooltip.innerHTML = `<div style="color:#daa520;font-weight:bold;margin-bottom:4px;">${upgrade.name} (Lv.${level})</div><div style="margin-bottom:6px;">${upgrade.desc}</div><div style="color:#7fff00;">Next: ${bonus}</div><div style="color:#daa520;">Cost: ${cost} Joules</div>`;
        this.upgradeTooltip.style.display = 'block';
        const menuRect = this.upgradeMenu.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        this.upgradeTooltip.style.top = (btnRect.top - menuRect.top) + 'px';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(184, 134, 11, 0.15)'; btn.style.color = '#ccc';
        this.upgradeTooltip.style.display = 'none';
      });
      btn.addEventListener('click', () => this.buyUpgrade(upgrade.key));
      this.upgradeMenu.appendChild(btn);
    });

    const upgradeCloseHint = document.createElement('div');
    upgradeCloseHint.textContent = '[U] or [Esc] to close';
    upgradeCloseHint.style.cssText = 'font-size: 10px; text-align: center; opacity: 0.35; margin-top: 10px;';
    this.upgradeMenu.appendChild(upgradeCloseHint);
    document.body.appendChild(this.upgradeMenu);
  },

  updateUpgradeButton(btn, upgrade) {
    const cost = getUpgradeCost(upgrade.key);
    const level = gameContext.upgradeState[upgrade.key].level;
    btn.innerHTML = `<span style="opacity:0.5;margin-right:6px;">${upgrade.hotkey}</span> ${upgrade.name} <span style="color:#888;font-size:11px;">Lv.${level}</span> <span style="float:right;color:#daa520;">${cost}</span>`;
  },

  refreshUpgradeButtons() {
    const upgradeTypes = [
      { key: 'windTurbine',    name: 'Wind Turbine',   hotkey: '1' },
      { key: 'solarPanel',    name: 'Solar Panel',    hotkey: '2' },
      { key: 'powerPlant',    name: 'Power Plant',    hotkey: '3' },
      { key: 'turret',        name: 'Turret',         hotkey: '4' },
      { key: 'missileTurret', name: 'Missile Turret', hotkey: '5' },
      { key: 'hydroElectric', name: 'Hydro Dam',      hotkey: '6' },
    ];
    upgradeTypes.forEach(upgrade => {
      if (this.upgradeButtons[upgrade.key]) {
        this.updateUpgradeButton(this.upgradeButtons[upgrade.key], upgrade);
      }
    });
  },

  buyUpgrade(type) {
    const cost = getUpgradeCost(type);
    if (gameContext.energy < cost) return;

    gameContext.energy -= cost;
    gameContext.upgradeState[type].level++;
    applyUpgradeToBuildings(type);
    this.refreshUpgradeButtons();
  },

  buyPowerUp(type, cost) {
    const { powerUpState, scene, buildings, zombies, bigZombies } = gameContext;
    if (gameContext.energy < cost) return;

    const cooldownKey = type + 'Cooldown';
    if (powerUpState[cooldownKey] > 0) return;

    gameContext.energy -= cost;

    switch (type) {
      case 'shield':
        powerUpState.shieldActive = true;
        powerUpState.shieldTimer = 10000;
        powerUpState.shieldCooldown = 45000;
        if (gameContext.shieldMesh) gameContext.shieldMesh.visible = true;
        buildings.forEach(b => {
          if (!b.shieldGlow && b.mesh) {
            const glow = new THREE.Mesh(
              new THREE.CircleGeometry(1.8, 32),
              new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
            );
            glow.rotation.x = -Math.PI / 2;
            glow.position.set(b.x, 0.05, b.z);
            scene.add(glow);
            b.shieldGlow = glow;
          }
        });
        break;
      case 'instaKill':
        powerUpState.instaKillActive = true;
        powerUpState.instaKillTimer = 10000;
        powerUpState.instaKillCooldown = 60000;
        zombies.forEach(z => { z.health = Math.min(z.health, 1); });
        bigZombies.forEach(z => { z.health = Math.min(z.health, Math.round(z.maxHealth * 0.1)); });
        break;
      case 'surge':
        powerUpState.surgeActive = true;
        powerUpState.surgeTimer = 10000;
        powerUpState.surgeCooldown = 30000;
        break;
    }
    this.update();
  },

  selectBuilding(type, cost) {
    gameContext.destroyMode = false;
    gameContext.selectedBuilding = type;
    gameContext.selectedBuildingCost = cost;
    const destroyBtn = document.getElementById('destroy-btn');
    if (destroyBtn) { destroyBtn.style.background = 'rgba(255, 60, 60, 0.15)'; destroyBtn.style.color = '#ccc'; destroyBtn.style.borderColor = 'rgba(255, 60, 60, 0.3)'; }
    this.buildMenu.querySelectorAll('button').forEach(btn => {
      btn.style.borderColor = btn.dataset.buildingType === type ? '#ffd700' : 'rgba(78, 205, 196, 0.3)';
    });
  },

  cancelSelection() {
    gameContext.selectedBuilding = null;
    gameContext.selectedBuildingCost = 0;
    gameContext.destroyMode = false;
    const destroyBtn = document.getElementById('destroy-btn');
    if (destroyBtn) { destroyBtn.style.background = 'rgba(255, 60, 60, 0.15)'; destroyBtn.style.color = '#ccc'; destroyBtn.style.borderColor = 'rgba(255, 60, 60, 0.3)'; }
    this.buildMenu.querySelectorAll('button').forEach(btn => {
      btn.style.borderColor = 'rgba(78, 205, 196, 0.3)';
    });
  },

  toggleDestroyMode() {
    gameContext.destroyMode = !gameContext.destroyMode;
    gameContext.selectedBuilding = null;
    gameContext.selectedBuildingCost = 0;
    this.buildMenu.querySelectorAll('button[data-building-type]').forEach(btn => {
      btn.style.borderColor = 'rgba(78, 205, 196, 0.3)';
    });
    const destroyBtn = document.getElementById('destroy-btn');
    if (destroyBtn) {
      destroyBtn.style.background = gameContext.destroyMode ? 'rgba(255, 60, 60, 0.45)' : 'rgba(255, 60, 60, 0.15)';
      destroyBtn.style.color = gameContext.destroyMode ? '#fff' : '#ccc';
      destroyBtn.style.borderColor = gameContext.destroyMode ? '#ff3c3c' : 'rgba(255, 60, 60, 0.3)';
    }
  },

  toggleBuildMode() {
    if (gameContext.powerUpMode) this.togglePowerUpMode();
    if (gameContext.upgradeMode) this.toggleUpgradeMode();
    gameContext.buildMode = !gameContext.buildMode;
    this.updateBuildMode();
    if (!gameContext.buildMode) this.cancelSelection();
  },

  togglePowerUpMode() {
    if (gameContext.buildMode) this.toggleBuildMode();
    if (gameContext.upgradeMode) this.toggleUpgradeMode();
    gameContext.powerUpMode = !gameContext.powerUpMode;
    this.updatePowerUpMode();
  },

  toggleUpgradeMode() {
    if (gameContext.buildMode) this.toggleBuildMode();
    if (gameContext.powerUpMode) this.togglePowerUpMode();
    gameContext.upgradeMode = !gameContext.upgradeMode;
    this.updateUpgradeMode();
  },

  updateBuildMode() {
    this.buildMenu.style.display = gameContext.buildMode ? 'block' : 'none';

    const { defaultCameraPos, buildModeCameraPos, camera } = gameContext;
    if (gameContext.buildMode) {
      camera.position.set(buildModeCameraPos.x, buildModeCameraPos.y - 15, buildModeCameraPos.z);
      camera.lookAt(0, 0, 0);
      this.buildModeIndicator.textContent = '🔨 BUILD MODE [B to exit]';
      this.buildModeIndicator.style.color = '#4ecdc4';
    } else {
      camera.position.set(defaultCameraPos.x, defaultCameraPos.y, defaultCameraPos.z);
      camera.lookAt(0, 0, 0);
      this.buildModeIndicator.textContent = '[B] Build Mode';
      this.buildModeIndicator.style.color = '#888';
    }

    updateGridRings();
  },

  updatePowerUpMode() {
    this.powerUpMenu.style.display = gameContext.powerUpMode ? 'block' : 'none';
    if (gameContext.powerUpMode) {
      this.powerUpModeIndicator.textContent = 'POWER UPS [P to exit]';
      this.powerUpModeIndicator.style.color = '#5dde8e';
    } else {
      this.powerUpModeIndicator.textContent = '[P] Power Ups';
      this.powerUpModeIndicator.style.color = '#888';
    }
  },

  updateUpgradeMode() {
    this.upgradeMenu.style.display = gameContext.upgradeMode ? 'block' : 'none';
    this.refreshUpgradeButtons();
    if (gameContext.upgradeMode) {
      this.upgradeModeIndicator.textContent = 'UPGRADES [U to exit]';
      this.upgradeModeIndicator.style.color = '#daa520';
    } else {
      this.upgradeModeIndicator.textContent = '[U] Upgrades';
      this.upgradeModeIndicator.style.color = '#888';
    }
  },

  update() {
    const ctx = gameContext;
    this.healthDisplay.textContent = `❤️: ${Math.round(ctx.playerHealth)}`;
    this.energyDisplay.textContent = `⚡: ${Math.round(ctx.energy)} Joules`;

    // Energy rate calculation
    const hydroLevel = ctx.upgradeState.hydroElectric.level;
    const hydroBonus = ctx.upgradeState.hydroElectric.bonus;
    let totalRatePerTick = ctx.hydroElectricRate * (1 + hydroLevel * hydroBonus);
    ctx.buildings.forEach(b => {
      if (!b.energyRate) return;
      if (b.type === 'solarPanel' && ctx.isNight) return;
      totalRatePerTick += b.energyRate;
    });
    const multiplier = ctx.powerUpState.surgeActive ? 2 : 1;
    totalRatePerTick *= multiplier;
    const totalRatePerSecond = totalRatePerTick * 10;
    const nightSuffix = ctx.isNight ? ' 🌙' : '';
    this.energyRateDisplay.textContent = `   +${totalRatePerSecond.toFixed(1)}/sec${multiplier > 1 ? ' (2x)' : ''}${nightSuffix}`;

    // Round info
    if (ctx.currentRound === 0) {
      this.roundDisplay.textContent = `🏗️ PREP PHASE`;
      this.zombiesDisplay.textContent = `Place a building to start!`;
      this.zombiesDisplay.style.color = '#ffd700';
      this.timerDisplay.textContent = ``;
    } else {
      this.roundDisplay.textContent = `🏆 Round ${ctx.currentRound}`;
      this.zombiesDisplay.style.color = '#ff9999';
      this.zombiesDisplay.textContent = `💀 Zombies: ${ctx.zombiesKilledThisRound}/${ctx.zombiesToKillThisRound}`;
      const timeLeft = Math.max(0, Math.ceil(ctx.roundTimeRemaining));
      this.timerDisplay.textContent = `⏱️ Time: ${timeLeft}s`;
      this.timerDisplay.style.color = (timeLeft <= 5 && timeLeft > 0) ? '#ff4444' : '#99ccff';
    }
  },

  // Power-up cooldown overlay visuals (called from game loop)
  updatePowerUpCooldowns(deltaTimeMs) {
    if (!this.powerUpMenu) return;
    const { powerUpState } = gameContext;
    const cdMaxes = { shield: 45000, instaKill: 60000, surge: 30000 };

    this.powerUpMenu.querySelectorAll('button').forEach(btn => {
      const key = btn.dataset.powerUpType;
      if (!key) return;
      const cdKey = key + 'Cooldown';
      const cd = powerUpState[cdKey];

      if (cd > 0) {
        const secs = Math.ceil(cd / 1000);
        const pct = Math.max(0, cd / cdMaxes[key]) * 100;
        btn.style.cursor = 'not-allowed';
        btn.style.color = '#777';

        let cdOverlay = btn.querySelector('.cd-overlay');
        if (!cdOverlay) {
          cdOverlay = document.createElement('div');
          cdOverlay.className = 'cd-overlay';
          cdOverlay.style.cssText = `position: absolute; top:0; left:0; bottom:0; background: rgba(0,0,0,0.55); pointer-events: none; transition: width 0.1s linear;`;
          btn.appendChild(cdOverlay);
        }
        cdOverlay.style.width = pct + '%';

        let cdLabel = btn.querySelector('.cd-label');
        if (!cdLabel) {
          cdLabel = document.createElement('div');
          cdLabel.className = 'cd-label';
          cdLabel.style.cssText = `position:absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; color:#ff8888; font-size:14px; font-weight:bold; text-shadow: 0 0 6px rgba(0,0,0,0.8); pointer-events:none; z-index:2;`;
          btn.appendChild(cdLabel);
        }
        cdLabel.textContent = secs + 's';
      } else {
        btn.style.cursor = 'pointer';
        btn.style.color = '#ccc';
        const cdOverlay = btn.querySelector('.cd-overlay');
        if (cdOverlay) cdOverlay.remove();
        const cdLabel = btn.querySelector('.cd-label');
        if (cdLabel) cdLabel.remove();
      }
    });
  },

  // Active buff icons (called from game loop)
  updateBuffIcons() {
    if (!this.activeBuffBar) return;
    const { powerUpState } = gameContext;

    const buffIcons = {
      shield:    { emoji: '🛡️', color: '#44aaff', label: 'SHIELD',     timer: powerUpState.shieldTimer },
      instaKill: { emoji: '💀', color: '#ff4444', label: 'INSTA KILL', timer: powerUpState.instaKillTimer },
      surge:     { emoji: '⚡', color: '#ffcc00', label: 'SURGE',      timer: powerUpState.surgeTimer },
    };

    const existing = this.activeBuffBar.querySelectorAll('[data-buff]');
    const activeKeys = new Set();

    for (const [key, info] of Object.entries(buffIcons)) {
      const timerKey = key + 'Active';
      if (!powerUpState[timerKey]) continue;
      activeKeys.add(key);

      let icon = this.activeBuffBar.querySelector(`[data-buff="${key}"]`);
      if (!icon) {
        icon = document.createElement('div');
        icon.dataset.buff = key;
        icon.style.cssText = `
          display: flex; flex-direction: column; align-items: center;
          background: linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0.55));
          border: 2px solid ${info.color}; border-radius: 10px; padding: 6px 10px 4px;
          min-width: 56px; box-shadow: 0 0 12px ${info.color}55, inset 0 0 8px ${info.color}22;
        `;
        icon.innerHTML = `
          <div style="font-size:24px;line-height:1;">${info.emoji}</div>
          <div class="buff-label" style="font-size:8px;color:${info.color};letter-spacing:1px;margin-top:2px;font-weight:bold;font-family:'Segoe UI',Arial,sans-serif;">${info.label}</div>
          <div class="buff-timer" style="font-size:12px;color:#fff;font-weight:bold;font-family:'Segoe UI',Arial,sans-serif;margin-top:1px;"></div>
        `;
        this.activeBuffBar.appendChild(icon);
      }

      const secs = Math.ceil(info.timer / 1000);
      icon.querySelector('.buff-timer').textContent = secs + 's';

      if (info.timer <= 3000 && info.timer > 0) {
        const flash = Math.sin(Date.now() * 0.012) > 0;
        icon.style.opacity = flash ? '1' : '0.3';
        icon.style.borderColor = flash ? info.color : '#666';
      } else {
        icon.style.opacity = '1';
        icon.style.borderColor = info.color;
      }
    }

    existing.forEach(el => { if (!activeKeys.has(el.dataset.buff)) el.remove(); });
  },
};
