import type { VocabularyExample, VocabularyItem } from '../../domain/models.js';

interface LearnerOverride {
  meaningsZhTw?: string[];
  collocations?: string[];
  example?: VocabularyExample;
}

const project = (ja: string, kana: string, zhTw: string): VocabularyExample => ({
  ja,
  kana,
  zhTw,
  source: 'project',
});

const entries: Array<[string, LearnerOverride]> = [
  ['私|わたし', { meaningsZhTw:['我'], collocations:['私は〜です','私の〜'], example:project('私は台湾から来ました。','わたしはたいわんからきました。','我來自台灣。') }],
  ['家族|かぞく', { meaningsZhTw:['家人；家族'], collocations:['家族と住む','家族に会う'], example:project('週末は家族と過ごします。','しゅうまつはかぞくとすごします。','週末會和家人一起度過。') }],
  ['学校|がっこう', { meaningsZhTw:['學校'], collocations:['学校へ行く','学校で勉強する'], example:project('毎朝八時に学校へ行きます。','まいあさはちじにがっこうへいきます。','每天早上八點去學校。') }],
  ['学生|がくせい', { meaningsZhTw:['學生'], collocations:['大学の学生','学生です'], example:project('妹は大学の学生です。','いもうとはだいがくのがくせいです。','妹妹是大學生。') }],
  ['会社|かいしゃ', { meaningsZhTw:['公司'], collocations:['会社へ行く','会社で働く'], example:project('父は東京の会社で働いています。','ちちはとうきょうのかいしゃではたらいています。','爸爸在東京的公司工作。') }],
  ['仕事|しごと', { meaningsZhTw:['工作；職業'], collocations:['仕事をする','仕事が終わる'], example:project('今日は仕事が六時に終わります。','きょうはしごとがろくじにおわります。','今天工作六點結束。') }],
  ['時間|じかん', { meaningsZhTw:['時間；小時'], collocations:['時間がある','時間がかかる'], example:project('少し時間がありますか。','すこしじかんがありますか。','你有一點時間嗎？') }],
  ['今日|きょう', { meaningsZhTw:['今天'], collocations:['今日の予定','今日は〜'], example:project('今日は家で勉強します。','きょうはいえでべんきょうします。','今天在家學習。') }],
  ['明日|あした', { meaningsZhTw:['明天'], collocations:['明日の朝','また明日'], example:project('明日は九時に駅で会いましょう。','あしたはくじにえきであいましょう。','明天九點在車站見吧。') }],
  ['昨日|きのう', { meaningsZhTw:['昨天'], collocations:['昨日の夜','昨日は〜'], example:project('昨日は友達と映画を見ました。','きのうはともだちとえいがをみました。','昨天和朋友看了電影。') }],
  ['朝|あさ', { meaningsZhTw:['早上；早晨'], collocations:['朝ご飯','朝早く'], example:project('朝はコーヒーを飲みます。','あさはこーひーをのみます。','早上會喝咖啡。') }],
  ['夜|よる', { meaningsZhTw:['晚上；夜晚'], collocations:['夜になる','夜遅く'], example:project('夜は十一時ごろ寝ます。','よるはじゅういちじごろねます。','晚上大約十一點睡。') }],
  ['午前|ごぜん', { meaningsZhTw:['上午；午前'], collocations:['午前九時','午前中'], example:project('病院は午前九時からです。','びょういんはごぜんくじからです。','醫院從上午九點開始看診。') }],
  ['午後|ごご', { meaningsZhTw:['下午；午後'], collocations:['午後三時','午後から'], example:project('午後三時に休憩します。','ごごさんじにきゅうけいします。','下午三點休息。') }],
  ['食べる|たべる', { meaningsZhTw:['吃'], collocations:['ご飯を食べる','一緒に食べる'], example:project('昼にラーメンを食べました。','ひるにらーめんをたべました。','中午吃了拉麵。') }],
  ['飲む|のむ', { meaningsZhTw:['喝；飲用'], collocations:['水を飲む','薬を飲む'], example:project('暑いので、水をたくさん飲みます。','あついので、みずをたくさんのみます。','因為很熱，所以會喝很多水。') }],
  ['水|みず', { meaningsZhTw:['水'], collocations:['水を飲む','水を入れる'], example:project('コップに水を入れてください。','こっぷにみずをいれてください。','請把水倒進杯子裡。') }],
  ['ご飯|ごはん', { meaningsZhTw:['飯；米飯；一餐'], collocations:['ご飯を食べる','朝ご飯'], example:project('一緒にご飯を食べませんか。','いっしょにごはんをたべませんか。','要不要一起吃飯？') }],
  ['買う|かう', { meaningsZhTw:['買；購買'], collocations:['店で買う','切符を買う'], example:project('駅で切符を買いました。','えきできっぷをかいました。','在車站買了車票。') }],
  ['店|みせ', { meaningsZhTw:['店；商店'], collocations:['店に入る','店で買う'], example:project('この店は夜九時まで開いています。','このみせはよるくじまであいています。','這家店營業到晚上九點。') }],
  ['お金|おかね', { meaningsZhTw:['錢；金錢'], collocations:['お金を払う','お金がない'], example:project('ここでお金を払います。','ここでおかねをはらいます。','在這裡付錢。') }],
  ['コップ|コップ', { meaningsZhTw:['杯子；玻璃杯'], collocations:['コップ一杯','コップに入れる'], example:project('コップに水を入れます。','こっぷにみずをいれます。','把水倒進杯子裡。') }],
  ['行く|いく', { meaningsZhTw:['去；前往'], collocations:['学校へ行く','旅行に行く'], example:project('明日、京都へ行きます。','あした、きょうとへいきます。','明天要去京都。') }],
  ['来る|くる', { meaningsZhTw:['來；到來'], collocations:['日本に来る','友達が来る'], example:project('友達が七時に家へ来ます。','ともだちがしちじにいえへきます。','朋友七點會來我家。') }],
  ['帰る|かえる', { meaningsZhTw:['回去；回家'], collocations:['家に帰る','国へ帰る'], example:project('仕事のあとで家に帰ります。','しごとのあとでいえにかえります。','下班後回家。') }],
  ['駅|えき', { meaningsZhTw:['車站'], collocations:['駅へ行く','駅の前'], example:project('駅の前で待っています。','えきのまえでまっています。','我在車站前面等。') }],
  ['電車|でんしゃ', { meaningsZhTw:['電車；火車'], collocations:['電車に乗る','電車を降りる'], example:project('毎朝電車で会社へ行きます。','まいあさでんしゃでかいしゃへいきます。','每天早上搭電車去公司。') }],
  ['車|くるま', { meaningsZhTw:['車；汽車'], collocations:['車に乗る','車を運転する'], example:project('車でスーパーへ行きます。','くるまでスーパーへいきます。','開車去超市。') }],
  ['右|みぎ', { meaningsZhTw:['右；右邊'], collocations:['右に曲がる','右側'], example:project('次の角を右に曲がってください。','つぎのかどをみぎにまがってください。','請在下一個轉角右轉。') }],
  ['左|ひだり', { meaningsZhTw:['左；左邊'], collocations:['左に曲がる','左側'], example:project('銀行は駅の左にあります。','ぎんこうはえきのひだりにあります。','銀行在車站左邊。') }],
  ['家|いえ', { meaningsZhTw:['家；房子'], collocations:['家に帰る','家で休む'], example:project('今日は家でゆっくり休みます。','きょうはいえでゆっくりやすみます。','今天在家好好休息。') }],
  ['部屋|へや', { meaningsZhTw:['房間'], collocations:['部屋に入る','部屋を掃除する'], example:project('部屋に大きな窓があります。','へやにおおきなまどがあります。','房間裡有一扇大窗戶。') }],
  ['見る|みる', { meaningsZhTw:['看；觀看'], collocations:['映画を見る','テレビを見る'], example:project('週末に映画を見ました。','しゅうまつにえいがをみました。','週末看了電影。') }],
  ['聞く|きく', { meaningsZhTw:['聽；詢問'], collocations:['音楽を聞く','先生に聞く'], example:project('分からないときは先生に聞きます。','わからないときはせんせいにききます。','不懂的時候會問老師。') }],
  ['話す|はなす', { meaningsZhTw:['說；交談'], collocations:['日本語を話す','友達と話す'], example:project('友達と日本語で話します。','ともだちとにほんごではなします。','和朋友用日文聊天。') }],
  ['読む|よむ', { meaningsZhTw:['讀；閱讀'], collocations:['本を読む','新聞を読む'], example:project('寝る前に本を読みます。','ねるまえにほんをよみます。','睡前會看書。') }],
  ['書く|かく', { meaningsZhTw:['寫；書寫'], collocations:['名前を書く','手紙を書く'], example:project('ここに名前を書いてください。','ここになまえをかいてください。','請在這裡寫名字。') }],
  ['使う|つかう', { meaningsZhTw:['使用；用'], collocations:['スマホを使う','日本語を使う'], example:project('このアプリを毎日使っています。','このあぷりをまいにちつかっています。','我每天都用這個 App。') }],
  ['会う|あう', { meaningsZhTw:['見面；遇見'], collocations:['友達に会う','駅で会う'], example:project('明日、駅で友達に会います。','あした、えきでともだちにあいます。','明天在車站和朋友見面。') }],
  ['待つ|まつ', { meaningsZhTw:['等；等待'], collocations:['少し待つ','駅で待つ'], example:project('ここで少し待ってください。','ここですこしまってください。','請在這裡稍等一下。') }],
  ['好き|すき', { meaningsZhTw:['喜歡；喜愛'], collocations:['〜が好き','好きなもの'], example:project('私は日本の音楽が好きです。','わたしはにほんのおんがくがすきです。','我喜歡日本音樂。') }],
  ['大きい|おおきい', { meaningsZhTw:['大；大的'], collocations:['大きい家','大きい声'], example:project('駅の前に大きいホテルがあります。','えきのまえにおおきいほてるがあります。','車站前有一間大飯店。') }],
  ['小さい|ちいさい', { meaningsZhTw:['小；小的'], collocations:['小さい店','小さい子供'], example:project('この店は小さいですが、とても人気です。','このみせはちいさいですが、とてもにんきです。','這家店雖然小，但很受歡迎。') }],
  ['新しい|あたらしい', { meaningsZhTw:['新；新的'], collocations:['新しい仕事','新しい店'], example:project('駅の近くに新しい店ができました。','えきのちかくにあたらしいみせができました。','車站附近開了一家新店。') }],
  ['古い|ふるい', { meaningsZhTw:['舊；古老的'], collocations:['古い家','古い写真'], example:project('これは祖父の古い写真です。','これはそふのふるいしゃしんです。','這是祖父的老照片。') }],
  ['高い|たかい', { meaningsZhTw:['高；昂貴'], collocations:['値段が高い','背が高い'], example:project('このホテルは少し高いです。','このほてるはすこしたかいです。','這間飯店有點貴。') }],
  ['安い|やすい', { meaningsZhTw:['便宜；廉價'], collocations:['値段が安い','安い店'], example:project('この店のランチは安くておいしいです。','このみせのらんちはやすくておいしいです。','這家店的午餐便宜又好吃。') }],
  ['いい|いい', { meaningsZhTw:['好；不錯；可以'], collocations:['いいです','〜てもいい'], example:project('この席に座ってもいいですか。','このせきにすわってもいいですか。','可以坐這個位子嗎？') }],
  ['悪い|わるい', { meaningsZhTw:['壞；不好'], collocations:['気分が悪い','天気が悪い'], example:project('今日は天気が悪いですね。','きょうはてんきがわるいですね。','今天天氣不好呢。') }],
  ['映画|えいが', { meaningsZhTw:['電影；影片'], collocations:['映画を見る','映画館'], example:project('今夜、一緒に映画を見ませんか。','こんや、いっしょにえいがをみませんか。','今晚要不要一起看電影？') }],
  ['音楽|おんがく', { meaningsZhTw:['音樂'], collocations:['音楽を聞く','日本の音楽'], example:project('電車の中で音楽を聞きます。','でんしゃのなかでおんがくをききます。','在電車裡聽音樂。') }],
  ['旅行|りょこう', { meaningsZhTw:['旅行'], collocations:['旅行に行く','旅行の予定'], example:project('来月、九州へ旅行に行きます。','らいげつ、きゅうしゅうへりょこうにいきます。','下個月要去九州旅行。') }],
  ['写真|しゃしん', { meaningsZhTw:['照片；相片'], collocations:['写真を撮る','写真を見る'], example:project('ここで写真を撮ってもいいですか。','ここでしゃしんをとってもいいですか。','可以在這裡拍照嗎？') }],
  ['天気|てんき', { meaningsZhTw:['天氣'], collocations:['天気がいい','天気予報'], example:project('明日は天気がいいそうです。','あしたはてんきがいいそうです。','聽說明天天氣很好。') }],
  ['何|なん', { meaningsZhTw:['什麼；幾'], collocations:['何ですか','何時'], example:project('これは何ですか。','これはなんですか。','這是什麼？') }],
  ['何|なに', { meaningsZhTw:['什麼'], collocations:['何をする','何が好き'], example:project('今日は何を食べたいですか。','きょうはなにをたべたいですか。','今天想吃什麼？') }],
  ['これ|これ', { meaningsZhTw:['這個；這'], collocations:['これは〜です','これをください'], example:project('これを一つください。','これをひとつください。','請給我一個這個。') }],
  ['それ|それ', { meaningsZhTw:['那個；那'], collocations:['それは〜です','それをください'], example:project('それはいくらですか。','それはいくらですか。','那個多少錢？') }],
  ['ここ|ここ', { meaningsZhTw:['這裡'], collocations:['ここにある','ここで待つ'], example:project('ここで待ってください。','ここでまってください。','請在這裡等。') }],
  ['そこ|そこ', { meaningsZhTw:['那裡；那邊'], collocations:['そこにある','そこで待つ'], example:project('荷物はそこに置いてください。','にもつはそこにおいてください。','請把行李放在那裡。') }],
  ['だんだん|だんだん', { meaningsZhTw:['漸漸；逐漸'], collocations:['だんだん寒くなる','だんだん分かる'], example:project('日本語がだんだん分かるようになりました。','にほんごがだんだんわかるようになりました。','我漸漸能理解日文了。') }],
];

const OVERRIDES = new Map(entries);

export function applyLearnerContent(item: VocabularyItem): VocabularyItem {
  const override = OVERRIDES.get(`${item.expression}|${item.reading}`);
  if (!override) return item;

  const examples = override.example
    ? [
        override.example,
        ...item.examples.filter((example) => example.ja !== override.example?.ja),
      ]
    : item.examples;

  return {
    ...item,
    ...(override.meaningsZhTw ? { meaningsZhTw: override.meaningsZhTw } : {}),
    ...(override.collocations ? { collocations: override.collocations } : {}),
    examples,
  };
}
