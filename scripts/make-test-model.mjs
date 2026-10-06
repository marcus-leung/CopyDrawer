// Writes a tiny stand-in for Xenova/all-MiniLM-L6-v2 to tests/fixtures/minilm-stub/,
// so end-to-end tests can run the real transformers.js + ONNX Runtime path in the
// extension's worker without downloading anything. Every byte is generated here.
//
// The "model" is one ONNX Gather node: each token maps to a fixed 16-number vector.
// Words about the same topic share a direction, so search by meaning is predictable.
// Usage: node scripts/make-test-model.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'tests/fixtures/minilm-stub';
const DIM = 16;

const TOPICS = {
  food: 'cook cooking recipe recipes pasta lemon garlic dinner bake oven flour sugar lasagna parmesan spaghetti',
  travel: 'hotel flight trip lisbon porto airbnb stay vacation holiday beach airport boarding tickets',
  code: 'code sql query function select join users orders javascript python bug',
  science: 'photosynthesis plants sunlight energy cell biology mitochondria science',
  money: 'budget invoice payment price quarterly review meeting notes agenda',
};
const SPECIAL = ['[PAD]', '[UNK]', '[CLS]', '[SEP]', '[MASK]'];
const FILLER = 'a an the of to in on for and is it this that my your with at by from as be are was'.split(' ');

const vocab = [...SPECIAL];
const vectors = SPECIAL.map(() => new Float32Array(DIM));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
Object.values(TOPICS).forEach((words, axis) => {
  for (const w of words.split(' ')) {
    const v = new Float32Array(DIM);
    v[axis] = 1;
    for (let i = 5; i < DIM; i++) v[i] = rand() * 0.15;
    vocab.push(w);
    vectors.push(v);
  }
});
for (const w of FILLER) {
  const v = new Float32Array(DIM);
  for (let i = 5; i < DIM; i++) v[i] = rand() * 0.05;
  vocab.push(w);
  vectors.push(v);
}
// [UNK]: a small vector of its own, so unknown words don't dominate.
for (let i = 5; i < DIM; i++) vectors[1][i] = rand() * 0.05;

// ---- minimal protobuf writer ----
function varint(n) {
  const out = [];
  let v = BigInt(n);
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return out;
}
const key = (field, wire) => varint((field << 3) | wire);
const vint = (field, n) => [...key(field, 0), ...varint(n)];
const bytes = (field, data) => [...key(field, 2), ...varint(data.length), ...data];
const str = (field, s) => bytes(field, [...Buffer.from(s, 'utf8')]);
const msg = (field, parts) => bytes(field, parts.flat());

const dim = (d) => (typeof d === 'number' ? msg(1, [vint(1, d)]) : msg(1, [str(2, d)]));
const valueInfo = (field, name, elemType, dims) =>
  msg(field, [str(1, name), msg(2, [msg(1, [vint(1, elemType), msg(2, dims.map(dim))])])]);

const INT64 = 7;
const FLOAT = 1;
const table = new Float32Array(vocab.length * DIM);
vectors.forEach((v, i) => table.set(v, i * DIM));
const initializer = msg(5, [vint(1, vocab.length), vint(1, DIM), vint(2, FLOAT), str(8, 'embeddings'), bytes(9, [...new Uint8Array(table.buffer)])]);
const node = msg(1, [str(1, 'embeddings'), str(1, 'input_ids'), str(2, 'last_hidden_state'), str(3, 'lookup'), str(4, 'Gather'), msg(5, [str(1, 'axis'), vint(3, 0), vint(20, 2)])]);
const graph = msg(7, [
  node,
  str(2, 'minilm-stub'),
  initializer,
  valueInfo(11, 'input_ids', INT64, ['batch', 'sequence']),
  valueInfo(11, 'attention_mask', INT64, ['batch', 'sequence']),
  valueInfo(12, 'last_hidden_state', FLOAT, ['batch', 'sequence', DIM]),
]);
const model = [...vint(1, 8), ...str(2, 'make-test-model'), ...graph, ...msg(8, [str(1, ''), vint(2, 13)])];

// ---- tokenizer files ----
const special = (id, content) => ({ id, content, single_word: false, lstrip: false, rstrip: false, normalized: false, special: true });
const tokenizer = {
  version: '1.0',
  truncation: null,
  padding: null,
  added_tokens: SPECIAL.map((t, i) => special(i, t)),
  normalizer: { type: 'BertNormalizer', clean_text: true, handle_chinese_chars: true, strip_accents: null, lowercase: true },
  pre_tokenizer: { type: 'BertPreTokenizer' },
  post_processor: {
    type: 'TemplateProcessing',
    single: [{ SpecialToken: { id: '[CLS]', type_id: 0 } }, { Sequence: { id: 'A', type_id: 0 } }, { SpecialToken: { id: '[SEP]', type_id: 0 } }],
    pair: [
      { SpecialToken: { id: '[CLS]', type_id: 0 } },
      { Sequence: { id: 'A', type_id: 0 } },
      { SpecialToken: { id: '[SEP]', type_id: 0 } },
      { Sequence: { id: 'B', type_id: 1 } },
      { SpecialToken: { id: '[SEP]', type_id: 1 } },
    ],
    special_tokens: {
      '[CLS]': { id: '[CLS]', ids: [2], tokens: ['[CLS]'] },
      '[SEP]': { id: '[SEP]', ids: [3], tokens: ['[SEP]'] },
    },
  },
  decoder: { type: 'WordPiece', prefix: '##', cleanup: true },
  model: { type: 'WordPiece', unk_token: '[UNK]', continuing_subword_prefix: '##', max_input_chars_per_word: 100, vocab: Object.fromEntries(vocab.map((w, i) => [w, i])) },
};
const tokenizerConfig = {
  tokenizer_class: 'BertTokenizer',
  do_lower_case: true,
  model_max_length: 512,
  cls_token: '[CLS]',
  sep_token: '[SEP]',
  pad_token: '[PAD]',
  unk_token: '[UNK]',
  mask_token: '[MASK]',
};
const config = { model_type: 'bert', architectures: ['BertModel'], hidden_size: DIM, num_attention_heads: 1, num_hidden_layers: 1, vocab_size: vocab.length, max_position_embeddings: 512 };

fs.mkdirSync(path.join(OUT, 'onnx'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'onnx/model_quantized.onnx'), Buffer.from(model));
fs.writeFileSync(path.join(OUT, 'tokenizer.json'), JSON.stringify(tokenizer));
fs.writeFileSync(path.join(OUT, 'tokenizer_config.json'), JSON.stringify(tokenizerConfig, null, 2));
fs.writeFileSync(path.join(OUT, 'config.json'), JSON.stringify(config, null, 2));
console.log(`wrote ${OUT} (${vocab.length} tokens, ${model.length} byte model)`);
