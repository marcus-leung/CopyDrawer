/**
 * Light syntax coloring for code clips: comments, strings, numbers and common
 * keywords. Not a full parser, just enough to make snippets easier to read.
 */
const KEYWORDS = new Set(
  `abstract and as async await break case catch class const continue def default del delete do elif else enum except export extends false final finally fn for from func function go if impl import in interface is let match mut new nil none not null of or package pass private protected pub public raise return self static struct super switch this throw true try type typeof undefined use var void while with yield
  select from where join left right inner outer on group by order having limit insert into values update set create table alter drop index distinct union all as asc desc count sum avg min max`.split(
    /\s+/,
  ),
);

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

export function CodeView({ code }: { code: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    if (index > last) parts.push(code.slice(last, index));
    const [text, comment, str, num, word] = m;
    const cls = comment
      ? 'text-text-3 italic'
      : str
        ? 'text-[#0E7A62] dark:text-[#5FD6B5]'
        : num
          ? 'text-[#B35A00] dark:text-[#FFB36B]'
          : word && KEYWORDS.has(word.toLowerCase())
            ? 'font-semibold text-[#6A46C9] dark:text-[#B69CFF]'
            : '';
    parts.push(
      cls ? (
        <span key={i++} className={cls}>
          {text}
        </span>
      ) : (
        text
      ),
    );
    last = index + text.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <code>{parts}</code>;
}
