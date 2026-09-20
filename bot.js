const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { pvp } = require('mineflayer-pvp');
const armorManager = require('mineflayer-armor-manager');
const autoEat = require('mineflayer-auto-eat').plugin;

// --- CONFIGURATION ---
const BOT_OWNER = 'x24_Nova_24x';
const BOT_USERNAME = 'x12_H4CK3R_12x';
const SERVER_HOST = 'Cosmic_Realm.aternos.me';
const SERVER_PORT = 59140;

const bot = mineflayer.createBot({
  host: SERVER_HOST,
  port: SERVER_PORT,
  username: BOT_USERNAME,
  version: false,
  auth: 'offline'
});

// Load Plugins
bot.loadPlugin(pathfinder);
bot.loadPlugin(pvp);
bot.loadPlugin(armorManager);
bot.loadPlugin(autoEat);

// State Settings
const trustedPlayers = new Set();
let itemPolicy = 'ask'; // 'always allow', 'always deny', 'ask'
let pendingRequest = null;
let isProtecting = false;
let protectTarget = null;
let protectMode = 'all'; // 'mobs', 'players', 'all'
let spamInterval = null;

bot.once('spawn', () => {
  console.log(`✅ Bot ${bot.username} connected to ${SERVER_HOST}:${SERVER_PORT}`);
  const defaultMove = new Movements(bot);
  bot.pathfinder.setMovements(defaultMove);

  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 14,
    bannedFood: ['rotten_flesh', 'pufferfish', 'spider_eye', 'poisonous_potato']
  };
});

function isAuthorized(username) {
  return username === BOT_OWNER || trustedPlayers.has(username);
}

bot.on('chat', async (username, message) => {
  if (username === bot.username) return;

  const rawMsg = message.trim();
  const args = rawMsg.toLowerCase().split(' ');
  const command = args[0];

  // Owner Trust Commands
  if (username === BOT_OWNER) {
    if (command === 'trust' && args[1]) {
      trustedPlayers.add(args[1]);
      bot.chat(`Added ${args[1]} to trusted players.`);
      return;
    }
    if (command === 'untrust' && args[1]) {
      trustedPlayers.delete(args[1]);
      bot.chat(`Removed ${args[1]} from trusted players.`);
      return;
    }
  }

  // Authorized Commands
  if (isAuthorized(username)) {
    if (rawMsg.toLowerCase().startsWith('policy ')) {
      const mode = rawMsg.substring(7).trim().toLowerCase();
      if (['always allow', 'always deny', 'ask'].includes(mode)) {
        itemPolicy = mode;
        bot.chat(`Policy set to: ${itemPolicy}`);
      }
      return;
    }

    if (pendingRequest && (command === '!yes' || command === '!no')) {
      if (command === '!yes') {
        bot.chat(`Request approved by ${username}! Executing...`);
        executeAction(pendingRequest.action, pendingRequest.data);
      } else {
        bot.chat(`Request denied by ${username}.`);
      }
      pendingRequest = null;
      return;
    }

    // Protection Commands
    if (command === 'protect') {
      if (args[1] === 'mode' && args[2]) {
        if (['mobs', 'players', 'all'].includes(args[2])) {
          protectMode = args[2];
          bot.chat(`Protection filter set to: ${protectMode}`);
        } else {
          bot.chat('Valid modes: mobs, players, all');
        }
        return;
      }

      const target = (args[1] === 'me' || !args[1]) ? username : args[1];
      requestAction(username, 'protect', target);
      return;
    }

    // Utility Commands
    if (command === 'follow') {
      const target = (args[1] === 'me' || !args[1]) ? username : args[1];
      requestAction(username, 'follow', target);
      return;
    }

    if (command === 'stop') {
      isProtecting = false;
      protectTarget = null;
      if (spamInterval) clearInterval(spamInterval);
      bot.pvp.stop();
      bot.pathfinder.setGoal(null);
      bot.chat('Stopped all current actions.');
      return;
    }

    if (command === 'dropall') {
      requestAction(username, 'dropall', null);
      return;
    }

    if (command === 'lookat') {
      const target = args[1] || username;
      requestAction(username, 'lookat', target);
      return;
    }

    if (command === 'spam') {
      const textToSpam = rawMsg.substring(5).trim();
      if (textToSpam) {
        requestAction(username, 'spam', textToSpam);
      }
      return;
    }

    if (rawMsg.toLowerCase() === 'equip armor') {
      requestAction(username, 'equip_armor', null);
      return;
    }

    if (command === 'use' && args[1]) {
      requestAction(username, 'use_item', args[1]);
      return;
    }
  } else {
    requestAction(username, 'chat_response', rawMsg);
  }
});

function requestAction(requester, action, data) {
  if (isAuthorized(requester) || itemPolicy === 'always allow') {
    executeAction(action, data);
    return;
  }

  if (itemPolicy === 'always deny') {
    bot.chat(`Sorry ${requester}, policy is set to Always Deny.`);
    return;
  }

  if (itemPolicy === 'ask') {
    pendingRequest = { requester, action, data };
    bot.chat(`Master ${BOT_OWNER}, ${requester} wants me to: '${action}'. Type !yes or !no.`);
  }
}

async function executeAction(action, data) {
  if (action === 'protect') {
    const player = bot.players[data]?.entity;
    if (!player) {
      bot.chat(`I can't see ${data} to protect them!`);
      return;
    }
    isProtecting = true;
    protectTarget = data;
    bot.chat(`Now protecting ${data}! [Mode: ${protectMode}]`);
  }

  if (action === 'follow') {
    const player = bot.players[data]?.entity;
    if (!player) {
      bot.chat(`I cannot find ${data}.`);
      return;
    }
    isProtecting = false;
    bot.pathfinder.setGoal(new goals.GoalFollow(player, 2));
    bot.chat(`Now following ${data}.`);
  }

  if (action === 'lookat') {
    const player = bot.players[data]?.entity;
    if (player) {
      bot.lookAt(player.position.offset(0, player.height, 0));
    }
  }

  if (action === 'dropall') {
    bot.chat('Dropping inventory...');
    for (const item of bot.inventory.items()) {
      try { await bot.tossStack(item); } catch (e) {}
    }
  }

  if (action === 'spam') {
    if (spamInterval) clearInterval(spamInterval);
    bot.chat(`Starting spam: "${data}"`);
    spamInterval = setInterval(() => { bot.chat(data); }, 2000);
  }

  if (action === 'equip_armor') {
    bot.armorManager.equipAll();
    bot.chat('Equipped best armor.');
  }

  if (action === 'use_item') {
    const item = bot.inventory.items().find(i => i.name.includes(data));
    if (!item) {
      bot.chat(`No ${data} found in my inventory.`);
      return;
    }
    try {
      await bot.equip(item, 'hand');
      await bot.activateItem();
      bot.chat(`Used ${item.name}.`);
    } catch (err) {
      bot.chat(`Could not use item: ${err.message}`);
    }
  }
}

bot.on('physicTick', () => {
  if (!isProtecting || !protectTarget) return;

  const targetEntity = bot.players[protectTarget]?.entity;
  if (!targetEntity) return;

  const dist = bot.entity.position.distanceTo(targetEntity.position);
  if (dist > 3) {
    bot.pathfinder.setGoal(new goals.GoalFollow(targetEntity, 2));
  }

  const hostile = bot.nearestEntity(e => {
    if (e === bot.entity || e === targetEntity) return false;
    if (e.position.distanceTo(targetEntity.position) > 6) return false;

    if (protectMode === 'mobs') return e.type === 'mob';
    if (protectMode === 'players') return e.type === 'player';
    return e.type === 'mob' || e.type === 'player';
  });

  if (hostile) {
    bot.pvp.attack(hostile);
  }
});

// Auto Reconnect Listener
bot.on('end', () => {
  console.log('Bot disconnected. Reconnecting in 10 seconds...');
  setTimeout(() => {
    process.exit(1);
  }, 10000);
});

