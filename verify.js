var fs = require('fs'), path = require('path'), os = require('os');
var parseLine = require('./out/parsers/TranscriptParser').parseLine;
var calc = require('./out/model/CostCalculator');

// Find active session
var sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
var entries = fs.readdirSync(sessionsDir, {withFileTypes: true});
var sessions = [];
for (var i = 0; i < entries.length; i++) {
  var e = entries[i];
  if (!e.isFile() || !e.name.endsWith('.json')) continue;
  var pid = parseInt(e.name.replace('.json',''), 10);
  var alive = false;
  try { process.kill(pid,0); alive = true; } catch(ex) { alive = ex.code === 'EPERM'; }
  if (!alive) continue;
  var d = JSON.parse(fs.readFileSync(path.join(sessionsDir, e.name), 'utf-8'));
  sessions.push({pid: pid, sessionId: d.sessionId, cwd: d.cwd, startedAt: d.startedAt});
}
sessions.sort(function(a,b){return b.startedAt - a.startedAt});
var s = sessions[0];
console.log('Active session:', s.sessionId.slice(0,8));

// Build transcript path using compiled module
var paths = require('./out/utils/paths');
var tp = paths.transcriptPath(s.cwd, s.sessionId);
console.log('Transcript:', tp);
console.log('Exists:', fs.existsSync(tp));

var content = fs.readFileSync(tp, 'utf-8');
var lines = content.split('\n').filter(function(l){return l.trim()});
console.log('Total lines:', lines.length);

var seen = {};
var lastAsst = null;
var lastUserTs = null;
var cumulativeInput = 0, cumulativeOutput = 0, cumulativeCacheRead = 0, cumulativeCost = 0;
var messageCount = 0, title = '', model = 'unknown';

for (var i = 0; i < lines.length; i++) {
  var evt = parseLine(lines[i]);
  if (!evt || evt.sessionId !== s.sessionId) continue;

  if (evt.type === 'ai-title' && evt.title) title = evt.title;
  else if (evt.type === 'user') lastUserTs = new Date(evt.timestamp).getTime();
  else if (evt.type === 'assistant' && evt.usage) {
    if (seen[evt.uuid]) continue;
    seen[evt.uuid] = true;
    model = calc.normalizeModelName(evt.model || model);
    var cost = calc.calculateCost(evt.model || model, evt.usage.input_tokens, evt.usage.cache_read_input_tokens, evt.usage.output_tokens);
    cumulativeInput += evt.usage.input_tokens;
    cumulativeOutput += evt.usage.output_tokens;
    cumulativeCacheRead += evt.usage.cache_read_input_tokens;
    cumulativeCost += cost;
    messageCount++;

    var thinkTime = null;
    if (lastUserTs !== null) { thinkTime = new Date(evt.timestamp).getTime() - lastUserTs; lastUserTs = null; }
    lastAsst = { model: model, inputTokens: evt.usage.input_tokens, outputTokens: evt.usage.output_tokens, cacheRead: evt.usage.cache_read_input_tokens, costCNY: cost, thinkTimeMs: thinkTime, ts: evt.timestamp };
  }
}

console.log('');
console.log('=== 最新一条消息 ===');
if (lastAsst) {
  var lastTotal = lastAsst.inputTokens + lastAsst.outputTokens;
  console.log('  输入 tokens:', lastAsst.inputTokens);
  console.log('  输出 tokens:', lastAsst.outputTokens);
  console.log('  入+出 =', lastTotal, '(显示为:', calc.abbreviateTokens(lastTotal), ')');
  console.log('  费用:', calc.formatCost(lastAsst.costCNY), '(原始: ¥' + lastAsst.costCNY.toFixed(6) + ')');
  console.log('  思考时间:', lastAsst.thinkTimeMs !== null ? (lastAsst.thinkTimeMs < 1000 ? lastAsst.thinkTimeMs + 'ms' : (lastAsst.thinkTimeMs/1000).toFixed(1) + 's') : '无');
  console.log('  时间戳:', lastAsst.ts);
}

console.log('');
var total = cumulativeInput + cumulativeCacheRead + cumulativeOutput;
console.log('=== 会话累计 ===');
console.log('  输入:', cumulativeInput.toLocaleString());
console.log('  缓存命中:', cumulativeCacheRead.toLocaleString());
console.log('  输出:', cumulativeOutput.toLocaleString());
console.log('  总 tokens:', total.toLocaleString(), '(' + calc.abbreviateTokens(total) + ')');
console.log('  总费用:', calc.formatCost(cumulativeCost), '(原始: ¥' + cumulativeCost.toFixed(4) + ')');
console.log('  消息数:', messageCount);

console.log('');
console.log('=== 状态栏应显示 ===');
var lastTotal = lastAsst ? lastAsst.inputTokens + lastAsst.outputTokens : 0;
var tt = lastAsst && lastAsst.thinkTimeMs;
var ttStr = tt ? (tt < 1000 ? tt + 'ms' : (tt/1000).toFixed(1) + 's') : '-';
var shortTitle = title ? (title.length > 8 ? title.slice(0,8) + '...' : title) : s.sessionId.slice(0,6) + '...';
console.log(shortTitle + ' | 思考' + ttStr + ' | ' + calc.abbreviateTokens(lastTotal) + ' ' + calc.formatCost(lastAsst ? lastAsst.costCNY : 0) + ' | 累计' + calc.abbreviateTokens(total) + ' ' + calc.formatCost(cumulativeCost));
