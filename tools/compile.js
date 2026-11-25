// Armedias CRM build: turns src/*.html (React JSX) into ready-to-run index.html / master.html.
// Run via ./build.sh (uses macOS JavaScriptCore + Babel; no Node needed).
ObjC.import('Foundation');
function rd(p) { return $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null).js; }
function wr(p, s) { $(s).writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null); }
function run(argv) {
  var self = this, window = this; eval(rd(argv[0]));
  var B = this.Babel || Babel, out = [];
  for (var i = 1; i < argv.length; i += 2) {
    var html = rd(argv[i]);
    var re = /<script type="text\/babel">([\s\S]*?)<\/script>(\s*<\/body>)/;
    var m = html.match(re);
    if (!m) throw new Error('No JSX block in ' + argv[i]);
    var js = B.transform(m[1], { presets: ['react'], comments: false, compact: true }).code;
    js = js.replace(/<\/script/gi, '<\\/script');
    if (js.indexOf('<?') !== -1) throw new Error('Compiled code contains "<?" which Apps Script templates would break');
    new Function(js); // must parse
    html = html.replace(/\s*<script src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"><\/script>/, '');
    html = html.replace(re, function () { return '<script>' + js + '</script>' + m[2]; });
    wr(argv[i + 1], html);
    out.push('built ' + argv[i + 1] + ' (' + Math.round(html.length / 1024) + ' KB)');
  }
  return out.join('\n');
}
