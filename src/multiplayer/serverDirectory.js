// Eaglercraft WSS endpoints are directory information, not Java transports.
export const SERVER_PRESETS = Object.freeze([
  Object.freeze({ id: 'archmc-preset', name: 'ArchMC', browserAddress: 'wss://arch.mc', address: 'gateway.arch.mc', version: '1.21.4', note: 'For ArchMC, enter a player name and connect without Microsoft sign-in. You may need to register in-game.' }),
  Object.freeze({ id: 'voidsent-preset', name: 'Voidsent MC', browserAddress: 'wss://mc.voidsent.net', address: 'play.voidsent.net', version: '1.21.4', note: 'Voidsent MC selected. Its Eaglercraft address supports browser play without a Java license. Java account requirements may differ.' }),
  Object.freeze({ id: 'zentic-preset', name: 'Zentic Network', browserAddress: 'wss://zentic.cc', address: 'zentic.cc', version: '1.21.4', note: 'Zentic Network selected. Its Eaglercraft address supports browser play without a Java license. Java account requirements may differ.' }),
  Object.freeze({ id: 'pika-preset', name: 'PikaNetwork', address: 'top.pika.host', version: '1.21.4', note: 'Offline browser login tested. Enter a player name; the server asks you to register in-game before playing.' }),
  Object.freeze({ id: 'jartex-preset', name: 'JartexNetwork', address: 'topt.jartex.fun', version: '1.21.4', note: 'Offline browser login tested. Enter a player name; the server asks you to register in-game before playing.' }),
  Object.freeze({ id: 'mineberry-preset', name: 'MineBerry', address: 'go.mineberry.org', version: '1.19.4', note: 'Offline browser login tested with 1.19.4. Keep this version selected; 1.21.4 disconnected during login. Register in-game using /reg.' }),
  Object.freeze({ id: 'extremecraft-preset', name: 'ExtremeCraft', address: 'top.extremecraft.net', version: '1.21.4', note: 'Offline browser login tested. Enter a player name; the server asks you to register in-game before playing.' }),
]);
