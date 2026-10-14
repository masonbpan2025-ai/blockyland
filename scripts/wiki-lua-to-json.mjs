// node scripts/wiki-lua-to-json.mjs --fengari <dir containing node_modules/fengari> <module.lua> <out.json>
//
// Runs a wiki data module that builds its table with Lua code (Module:Inventory slot/Aliases generates its wood,
// dye and colour families in loops) and writes the table it returns as JSON. Needs the fengari Lua VM, which is
// not a dependency of the game: install it anywhere (`npm install fengari@0.1.4`) and point --fengari at it.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const at = args.indexOf('--fengari');
if (at < 0) throw new Error('pass --fengari <dir> (a directory where fengari is installed)');
const require = createRequire(resolve(args[at + 1], 'package.json'));
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');
const [source, out] = args.filter((_, i) => i !== at && i !== at + 1);

const ENCODER = `
local function enc(v, seen)
  local t = type(v)
  if t == 'string' then return string.format('%q', v):gsub('\\\\\\n', '\\\\n') end
  if t == 'number' or t == 'boolean' then return tostring(v) end
  if t ~= 'table' then return 'null' end
  local n = #v
  local isArray = n > 0
  for k in pairs(v) do if type(k) ~= 'number' or k > n or k < 1 or k % 1 ~= 0 then isArray = false break end end
  local parts = {}
  if isArray then
    for i = 1, n do parts[#parts + 1] = enc(v[i]) end
    return '[' .. table.concat(parts, ',') .. ']'
  end
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  for _, k in ipairs(keys) do
    local val = v[k]; if val == nil then val = v[tonumber(k)] end
    parts[#parts + 1] = string.format('%q', k) .. ':' .. enc(val)
  end
  return '{' .. table.concat(parts, ',') .. '}'
end
`;
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const program = `${ENCODER}\nlocal __module = (function()\n${readFileSync(source, 'utf8')}\nend)()\nreturn enc(__module)`;
if (lauxlib.luaL_dostring(L, to_luastring(program)) !== lua.LUA_OK) throw new Error(to_jsstring(lua.lua_tostring(L, -1)));
const json = to_jsstring(lua.lua_tostring(L, -1));
writeFileSync(out, JSON.stringify(JSON.parse(json), null, 1));
console.log(`${source} -> ${out}: ${Object.keys(JSON.parse(json)).length} keys`);
