import type { ContentPack } from '../../core/contracts/content.js';
import type { VocabularyItem } from '../../domain/models.js';
const seeds=[
{expression:'私',reading:'わたし',meaningsZhTw:['我'],exampleJa:'私は台湾から来ました。',exampleZh:'我來自台灣。'},{expression:'あなた',reading:'あなた',meaningsZhTw:['你、您'],exampleJa:'あなたは学生ですか。',exampleZh:'你是學生嗎？'},{expression:'人',reading:'ひと',meaningsZhTw:['人'],exampleJa:'あの人は先生です。',exampleZh:'那個人是老師。'},{expression:'日本',reading:'にほん',meaningsZhTw:['日本'],exampleJa:'日本へ行きたいです。',exampleZh:'我想去日本。'},{expression:'日本語',reading:'にほんご',meaningsZhTw:['日語'],exampleJa:'日本語を勉強しています。',exampleZh:'我正在學日語。'},{expression:'先生',reading:'せんせい',meaningsZhTw:['老師、先生'],exampleJa:'田中先生に聞きます。',exampleZh:'我會問田中老師。'},{expression:'学生',reading:'がくせい',meaningsZhTw:['學生'],exampleJa:'妹は大学生です。',exampleZh:'妹妹是大學生。'},{expression:'会社',reading:'かいしゃ',meaningsZhTw:['公司'],exampleJa:'会社は駅の近くです。',exampleZh:'公司在車站附近。'},{expression:'仕事',reading:'しごと',meaningsZhTw:['工作'],exampleJa:'仕事は九時からです。',exampleZh:'工作從九點開始。'},{expression:'今日',reading:'きょう',meaningsZhTw:['今天'],exampleJa:'今日は忙しいです。',exampleZh:'今天很忙。'},{expression:'明日',reading:'あした',meaningsZhTw:['明天'],exampleJa:'明日、東京へ行きます。',exampleZh:'明天去東京。'},{expression:'昨日',reading:'きのう',meaningsZhTw:['昨天'],exampleJa:'昨日は雨でした。',exampleZh:'昨天是雨天。'},{expression:'今',reading:'いま',meaningsZhTw:['現在'],exampleJa:'今、何時ですか。',exampleZh:'現在幾點？'},{expression:'時間',reading:'じかん',meaningsZhTw:['時間'],exampleJa:'時間がありますか。',exampleZh:'你有時間嗎？'},{expression:'家',reading:'いえ',meaningsZhTw:['家、房子'],exampleJa:'家に帰ります。',exampleZh:'回家。'},{expression:'駅',reading:'えき',meaningsZhTw:['車站'],exampleJa:'駅まで歩きます。',exampleZh:'走路到車站。'},{expression:'電車',reading:'でんしゃ',meaningsZhTw:['電車'],exampleJa:'電車で会社へ行きます。',exampleZh:'搭電車去公司。'},{expression:'車',reading:'くるま',meaningsZhTw:['汽車、車'],exampleJa:'車を運転します。',exampleZh:'開車。'},{expression:'水',reading:'みず',meaningsZhTw:['水'],exampleJa:'水をください。',exampleZh:'請給我水。'},{expression:'食べる',reading:'たべる',meaningsZhTw:['吃'],exampleJa:'朝ご飯を食べます。',exampleZh:'吃早餐。'},{expression:'飲む',reading:'のむ',meaningsZhTw:['喝'],exampleJa:'毎朝コーヒーを飲みます。',exampleZh:'每天早上喝咖啡。'},{expression:'見る',reading:'みる',meaningsZhTw:['看、觀看'],exampleJa:'映画を見ます。',exampleZh:'看電影。'},{expression:'聞く',reading:'きく',meaningsZhTw:['聽；詢問'],exampleJa:'音楽を聞きます。',exampleZh:'聽音樂。'},{expression:'話す',reading:'はなす',meaningsZhTw:['說、交談'],exampleJa:'日本語で話します。',exampleZh:'用日語說話。'},{expression:'読む',reading:'よむ',meaningsZhTw:['讀、閱讀'],exampleJa:'本を読みます。',exampleZh:'讀書。'},{expression:'書く',reading:'かく',meaningsZhTw:['寫'],exampleJa:'名前を書いてください。',exampleZh:'請寫名字。'},{expression:'行く',reading:'いく',meaningsZhTw:['去'],exampleJa:'学校へ行きます。',exampleZh:'去學校。'},{expression:'来る',reading:'くる',meaningsZhTw:['來'],exampleJa:'友達が家に来ます。',exampleZh:'朋友會來家裡。'},{expression:'帰る',reading:'かえる',meaningsZhTw:['回去、回家'],exampleJa:'六時に帰ります。',exampleZh:'六點回家。'},{expression:'買う',reading:'かう',meaningsZhTw:['買'],exampleJa:'コンビニで水を買います。',exampleZh:'在便利商店買水。'},{expression:'大きい',reading:'おおきい',meaningsZhTw:['大的'],exampleJa:'大きい家ですね。',exampleZh:'好大的房子。'},{expression:'小さい',reading:'ちいさい',meaningsZhTw:['小的'],exampleJa:'小さい犬がいます。',exampleZh:'有一隻小狗。'},{expression:'新しい',reading:'あたらしい',meaningsZhTw:['新的'],exampleJa:'新しい靴を買いました。',exampleZh:'買了新鞋。'},{expression:'古い',reading:'ふるい',meaningsZhTw:['舊的；古老的'],exampleJa:'これは古い建物です。',exampleZh:'這是一棟老建築。'},{expression:'高い',reading:'たかい',meaningsZhTw:['高的；貴的'],exampleJa:'この時計は高いです。',exampleZh:'這支錶很貴。'},{expression:'安い',reading:'やすい',meaningsZhTw:['便宜的'],exampleJa:'この店は安いです。',exampleZh:'這家店很便宜。'},{expression:'早い',reading:'はやい',meaningsZhTw:['早的；快的'],exampleJa:'今日は早く帰ります。',exampleZh:'今天會早點回家。'},{expression:'遅い',reading:'おそい',meaningsZhTw:['晚的；慢的'],exampleJa:'電車が少し遅いです。',exampleZh:'電車稍微晚了。'},{expression:'好き',reading:'すき',meaningsZhTw:['喜歡'],exampleJa:'日本料理が好きです。',exampleZh:'我喜歡日本料理。'},{expression:'分かる',reading:'わかる',meaningsZhTw:['懂、明白'],exampleJa:'日本語が少し分かります。',exampleZh:'我懂一點日語。'}
] as const;

const SAMPLE_EXAMPLE_ROMAJI: Record<string, string> = {
  '私は台湾から来ました。': 'Watashi wa Taiwan kara kimashita.',
  'あなたは学生ですか。': 'Anata wa gakusei desu ka.',
  'あの人は先生です。': 'Ano hito wa sensei desu.',
  '日本へ行きたいです。': 'Nihon e ikitai desu.',
  '日本語を勉強しています。': 'Nihongo o benkyou shiteimasu.',
  '田中先生に聞きます。': 'Tanaka-sensei ni kikimasu.',
  '妹は大学生です。': 'Imouto wa daigakusei desu.',
  '会社は駅の近くです。': 'Kaisha wa eki no chikaku desu.',
  '仕事は九時からです。': 'Shigoto wa kuji kara desu.',
  '今日は忙しいです。': 'Kyou wa isogashii desu.',
  '明日、東京へ行きます。': 'Ashita, Toukyou e ikimasu.',
  '昨日は雨でした。': 'Kinou wa ame deshita.',
  '今、何時ですか。': 'Ima, nanji desu ka.',
  '時間がありますか。': 'Jikan ga arimasu ka.',
  '家に帰ります。': 'Ie ni kaerimasu.',
  '駅まで歩きます。': 'Eki made arukimasu.',
  '電車で会社へ行きます。': 'Densha de kaisha e ikimasu.',
  '車を運転します。': 'Kuruma o untenshimasu.',
  '水をください。': 'Mizu o kudasai.',
  '朝ご飯を食べます。': 'Asa gohan o tabemasu.',
  '毎朝コーヒーを飲みます。': 'Maiasa koohii o nomimasu.',
  '映画を見ます。': 'Eiga o mimasu.',
  '音楽を聞きます。': 'Ongaku o kikimasu.',
  '日本語で話します。': 'Nihongo de hanashimasu.',
  '本を読みます。': 'Hon o yomimasu.',
  '名前を書いてください。': 'Namae o kaite kudasai.',
  '学校へ行きます。': 'Gakkou e ikimasu.',
  '友達が家に来ます。': 'Tomodachi ga ie ni kimasu.',
  '六時に帰ります。': 'Rokuji ni kaerimasu.',
  'コンビニで水を買います。': 'Konbini de mizu o kaimasu.',
  '大きい家ですね。': 'Ookii ie desu ne.',
  '小さい犬がいます。': 'Chiisai inu ga imasu.',
  '新しい靴を買いました。': 'Atarashii kutsu o kaimashita.',
  'これは古い建物です。': 'Kore wa furui tatemono desu.',
  'この時計は高いです。': 'Kono tokei wa takai desu.',
  'この店は安いです。': 'Kono mise wa yasui desu.',
  '今日は早く帰ります。': 'Kyou wa hayaku kaerimasu.',
  '電車が少し遅いです。': 'Densha ga sukoshi osoi desu.',
  '日本料理が好きです。': 'Nihon ryouri ga suki desu.',
  '日本語が少し分かります。': 'Nihongo ga sukoshi wakarimasu.',
};

const items: VocabularyItem[] = seeds.map((seed, index) => {
  const romaji = SAMPLE_EXAMPLE_ROMAJI[seed.exampleJa];
  if (!romaji) throw new Error(`Missing sample example romaji: ${seed.exampleJa}`);
  return {
    id: `vocab:n5:${index + 1}`,
    kind: 'vocabulary',
    expression: seed.expression,
    reading: seed.reading,
    meaningsZhTw: [...seed.meaningsZhTw],
    jlpt: 'N5',
    tags: ['core', 'sample'],
    examples: [{ ja: seed.exampleJa, romaji, zhTw: seed.exampleZh }],
    order: 2000 + index,
  };
});
export const sampleN5Pack: ContentPack={id:'vocab-n5-sample-zh-tw',title:'N5 核心單字（示範包）',description:'用於驗證學習體驗的 40 個常用詞。正式詞庫將以可追溯來源的獨立內容包匯入。',version:'0.1.0',sourceLabel:'Project-authored seed list',licenseLabel:'Project-authored sample data',items};
