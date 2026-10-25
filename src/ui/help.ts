import { APP_NAME } from '../config';
import { h } from './dom';

type Lang = 'en' | 'ja';

/** A section lists keys or controls with what they do, and / or plain points. */
type Section = { title: string; rows?: [string, string][]; points?: string[] };

type Text = { title: string; close: string; switchTo: string; sections: Section[] };

const LANG_KEY = 'cue-player-help-lang';

const HELP: Record<Lang, Text> = {
  en: {
    title: 'Help',
    close: 'Close',
    switchTo: '日本語',
    sections: [
      {
        title: 'What it is',
        points: [
          `${APP_NAME} is a playback-only web app made for live shows. Each page holds one audio file and one video file. There is no editing: you can only set where a track starts and ends.`,
          'At the markers on the track it can show text: lyrics in time with the music, or text over the video for a karaoke-style video.',
          'In the same way, it can send a MIDI Note at each marker, to control external gear.',
          'Pages set the running order. When a song ends, the next page can play on by itself, or start over the end of the song with the overlap mark.',
          'It sends MTC from the playback time. A page can also follow MTC from a DAW instead, showing the memos and sending the MIDI Notes while the DAW plays the sound.',
          'Chrome only. Media and the project are kept in this browser.',
        ],
      },
      {
        title: 'Show mode',
        points: [
          'Press SHOW (top right) for the show. Editing is locked, and SHOW and the app name at the bottom right turn red.',
          'Still working: GO, play and stop, choosing the cue on standby and the page, the mixer, the monitor views, the output window and Save.',
          'Locked: adding, moving or deleting cues, editing names, memos and MIDI, in / out and overlap marks, media, pages, settings, New and Import, and clicking the track to move the playhead.',
          'To edit again, press SHOW twice (it asks “Exit?” first). Show mode stays on after a reload.',
        ],
      },
      {
        title: 'Keyboard',
        rows: [
          ['Space', 'Play / stop at once'],
          ['G', 'GO: play from the cue on standby'],
          ['Esc', 'Fade out and stop (time in Settings); again to stop at once'],
          ['D', 'Duck: lower everything for an announcement (how much and how fast in Settings); again to bring it back'],
          ['M', 'Add a cue at the playhead'],
          ['← / →', 'Previous / next cue'],
          ['↑ / ↓', 'Previous / next cue, in Cue List order'],
          ['⌥ ← / ⌥ →,  , / .', 'Back / forward 5 seconds'],
          ['⌥ ↑ / ⌥ ↓', 'Previous / next page'],
          ['Home', 'Go to the in point (start)'],
          ['I / O', 'In / out point at the playhead (⌥ clears)'],
          ['X', 'Overlap mark at the playhead (⌥ clears)'],
          ['= / -', 'Zoom the track in / out'],
          ['/  or  ⇧Z', 'Fit: show the page up to its end point'],
          ['F', 'Fullscreen (to leave it: F, or hold Esc)'],
          ['⌘Z / ⇧⌘Z', 'Undo / redo an edit (the mixer is not undone)'],
          ['⌘S / ⇧⌘S', 'Save / save to a new file'],
          ['⌘,', 'Settings'],
          ['?', 'This help'],
        ],
      },
      {
        title: 'Track',
        rows: [
          ['Click / drag', 'Move the playhead'],
          ['Drag a cue', 'Move the cue: grab its name flag or its line'],
          ['Drag a clip', 'Move the audio or video on the page (cues move with the audio)'],
          ['Orange flags', 'In / out points: only this part plays. Drag them; ⌥-click clears'],
          ['Purple flag', 'Overlap mark: the next page starts here while this page’s audio rings out to its out point'],
          ['Pinch / swipe', 'Zoom / scroll the track'],
        ],
      },
      {
        title: 'Pages',
        rows: [
          ['Stop / Next / Next ▶', 'At the end of the page: stop, open the next page, or play it'],
          ['🔁', 'Loop all pages: after the last page comes the first'],
          ['Drag a page', 'Reorder pages'],
          ['Double-click', 'Rename'],
          ['Total', 'How long the Play list takes played through: each page from its in to its out point, or to its overlap mark. +? means some media is missing'],
        ],
      },
      {
        title: 'Cue List',
        rows: [
          ['Blue row, red ▶', 'The cue playing. As playback passes a cue, the standby moves on to the next one'],
          ['Green row', 'The cue on standby for GO; click a row to choose another'],
          ['Double-click', 'Edit the name, memo, time or note number'],
          ['Title / Memo', 'Show cue names or memos. In a memo, Shift+Enter starts a new line'],
          ['On / Off', 'Send a MIDI Note when playback reaches the cue'],
          ['MIDI', 'Turn the page’s MIDI Notes on or off as a whole'],
          ['+ / 🗑', 'Add a cue at the playhead / delete the cue on standby'],
          ['Auto', 'Scroll to follow playback (also in PAGES)'],
        ],
      },
      {
        title: 'Monitor',
        rows: [
          ['Video', 'What the video output shows: the video, with the memos while Memo on Video Output is On'],
          ['Memo', 'The memo of the last cue passed (lyrics, prompts); ⚙ shows the settings'],
          ['Mixer', 'Audio, Video and Master faders with pan and mute; double-click resets'],
          ['Video (Memo on Video Output)', 'On: the memos also show over the video on the video output. Off: the video alone'],
          ['Open Video Output', 'A window for the second display; double-click it or press F for fullscreen'],
          ['Open Prompter', 'A window with the memos alone, for the performers. Turn Video off in the Memo settings to keep them off the audience’s video'],
        ],
      },
      {
        title: 'MTC and MIDI',
        points: [
          'Settings: choose the MIDI output, the MTC frame rate and each page’s MTC offset.',
          'MIDI Note: channel, note and velocity used by cues without their own note.',
          'Following a DAW: switch PAGES to MTC In and press + for a page that follows the MTC from a DAW, which plays the sound. Without audio, a page is a blank track (its Length is in Settings, 5 minutes to start with): put cues on it with M, and choose the MTC Input in Settings. The page plays, stops and locates with the DAW, from its MTC offset as its start; MTC IN lights red at the top while MTC comes in (MTC OUT, green, is sending). MTC In pages send no MTC, and have no end action, page loop, loop or overlap: the DAW decides what plays. Running order and Next stay within each list.',
          'On a Mac, the IAC Driver (Audio MIDI Setup) sends MIDI to other apps.',
          'MIDI Remote (Settings): choose a MIDI input, then Learn a key, pad or pedal for GO, Play / Stop, Fade Out, Duck, Previous Cue and Next Cue. Notes and CCs both work, also in show mode. Use a different port from the MIDI output.',
          'Audio Output (Settings): the device all of the app’s sound plays through, such as an audio interface. It is remembered on this computer; Show Names lets Chrome name the devices.',
        ],
      },
      {
        title: 'Files',
        points: [
          'Save is in the footer; New, Import, Export, Save, Backup, Restore and Find Media are in Settings.',
          'Project files (Save / Export) do not include audio or video.',
          'Backup writes a folder with the project and all its media; Restore opens it complete, also on another computer.',
          'Find Media: after Import, choose a folder of the original files and missing media are filled in by file name.',
        ],
      },
      {
        title: 'Good to know',
        points: [
          'The overlap mark is for audio files: only the audio rings out; the video does not overlap.',
          'Cues outside the in / out points are skipped by GO and send no MIDI Notes.',
          'Drag the borders between the areas to resize them; double-click a border to put it back.',
          'Open the app in one tab only: with two, each saves over the other, and a yellow warning shows.',
          'When Offline Ready shows at the bottom right, the app also opens and reloads on this computer without a connection.',
        ],
      },
    ],
  },
  ja: {
    title: 'ヘルプ',
    close: '閉じる',
    switchTo: 'English',
    sections: [
      {
        title: 'このアプリについて',
        points: [
          `${APP_NAME} は、ショーの本番向けに開発した再生専用の Web アプリです。1 ページで扱えるのは、オーディオファイル 1 つと映像ファイル 1 つだけです。編集機能はついていません。できるのは、トラックの最初と最後のポイントを指定することだけです。`,
          'トラックに打ったマーカーのタイミングで、文字を出力できます。音楽に合わせて歌詞を表示したり、文字を映像の上に載せてカラオケビデオ風にしたりできます。',
          '同じようにマーカーのタイミングで MIDI Note を出力できます。外部機器の制御用です。',
          'ページ管理で曲順を決めます。曲が終わったら次のページを自動で再生したり、オーバーラップ機能で曲の終わりに重ねて次の曲を始めたりできます。',
          '再生時間で MTC を出力します。逆に、DAW から来る MTC に合わせて動くページも作れます。音は DAW が出し、Show Tracks はメモと MIDI Note を担当します。',
          'Chrome 専用です。メディアとプロジェクトは、このブラウザの中に保存されます。',
        ],
      },
      {
        title: 'ショーモード',
        points: [
          '本番では右上の SHOW を押します。編集がロックされ、SHOW ボタンと右下の SHOW TRACKS の文字が赤くなります。',
          '使えるもの: GO、再生と停止、待機中の Cue とページの選択、ミキサー、モニターの切り替え、出力ウィンドウ、Save。',
          'ロックされるもの: Cue の追加・移動・削除、名前・メモ・MIDI の編集、イン / アウト点とオーバーラップ、メディア、ページ、設定、New と Import、トラックのクリックでの再生位置の移動。',
          '編集に戻るには SHOW を 2 回押します（1 回目は「Exit?」と表示）。再読み込みしてもショーモードのままです。',
        ],
      },
      {
        title: 'キーボード',
        rows: [
          ['Space', '再生 / すぐに停止'],
          ['G', 'GO: 待機中の Cue から再生'],
          ['Esc', 'フェードアウトして停止（長さは設定で）。もう一度押すとすぐに停止'],
          ['D', 'ダック。アナウンス用に全体の音を下げる（下げる量と時間は設定で）。もう一度押すと戻る'],
          ['M', '再生位置に Cue を追加'],
          ['← / →', '前 / 次の Cue へ'],
          ['↑ / ↓', 'Cue List の順で前 / 次の Cue へ'],
          ['⌥ ← / ⌥ →、, / .', '5 秒戻る / 進む'],
          ['⌥ ↑ / ⌥ ↓', '前 / 次のページへ'],
          ['Home', 'イン点（頭）へ'],
          ['I / O', '再生位置をイン点 / アウト点に（⌥ で解除）'],
          ['X', '再生位置にオーバーラップのマーク（⌥ で解除）'],
          ['= / -', 'トラックの拡大 / 縮小'],
          ['/  または  ⇧Z', 'Fit: エンドポイントまでを表示'],
          ['F', '全画面（解除は F か Esc の長押し）'],
          ['⌘Z / ⇧⌘Z', '編集を元に戻す / やり直す（ミキサーは戻らない）'],
          ['⌘S / ⇧⌘S', '保存 / 別のファイルに保存'],
          ['⌘,', '設定'],
          ['?', 'このヘルプ'],
        ],
      },
      {
        title: 'トラック',
        rows: [
          ['クリック / ドラッグ', '再生位置を動かす'],
          ['Cue をドラッグ', 'Cue を動かす。名前の旗か縦の線をつかむ'],
          ['クリップをドラッグ', '音声や映像の位置を動かす（Cue は音声と一緒に動く）'],
          ['オレンジの旗', 'イン点 / アウト点。この間だけ再生する。ドラッグで移動、⌥ クリックで解除'],
          ['紫の旗', 'オーバーラップ。ここで次のページが始まり、このページの音はアウト点まで鳴り残る'],
          ['ピンチ / スワイプ', 'トラックの拡大 / スクロール'],
        ],
      },
      {
        title: 'ページ',
        rows: [
          ['Stop / Next / Next ▶', 'ページの終わりで、止まる / 次のページを開く / 次のページを再生する'],
          ['🔁', '全ページのループ。最後のページの次は最初に戻る'],
          ['ページをドラッグ', '並べ替え'],
          ['ダブルクリック', '名前の変更'],
          ['Total', 'Play の一覧を通して流したときの時間。各ページは In から Out まで、オーバーラップがあればその位置まで。+? は見つからないメディアがあるという印'],
        ],
      },
      {
        title: 'Cue List',
        rows: [
          ['青い行、赤い ▶', '再生中の Cue。再生が Cue を通過すると、待機は次の Cue に進む'],
          ['緑の行', 'GO で再生する待機中の Cue。行をクリックで選び直せる'],
          ['ダブルクリック', '名前、メモ、時間、Note 番号の編集'],
          ['Title / Memo', '名前とメモの表示を切り替え。メモは Shift+Enter で改行'],
          ['On / Off', '再生がその Cue に来たら MIDI Note を送る'],
          ['MIDI', 'このページの MIDI Note をまとめて On / Off'],
          ['+ / 🗑', '再生位置に Cue を追加 / 待機中の Cue を削除'],
          ['Auto', '再生に合わせて自動でスクロール（PAGES にもあります）'],
        ],
      },
      {
        title: 'モニター',
        rows: [
          ['Video', '映像出力と同じ画面。Memo on Video Output が On なら、映像の上にメモも出る'],
          ['Memo', '最後に通過した Cue のメモ（歌詞、カンペ）。⚙ で設定を表示'],
          ['Mixer', 'Audio、Video、Master のフェーダー、Pan、ミュート。ダブルクリックで元に戻る'],
          ['Video（Memo on Video Output）', 'On: 映像出力でも映像の上にメモを出す。Off: 映像だけ'],
          ['Open Video Output', '外部モニター用のウィンドウ。ダブルクリックか F で全画面'],
          ['Open Prompter', 'メモだけを出す演者用のウィンドウ。Memo の設定の Video を Off にすると、お客さん向けの映像にはメモが出ない'],
        ],
      },
      {
        title: 'MTC と MIDI',
        points: [
          '設定で、MIDI の出力先、MTC のフレームレート、ページごとの MTC オフセットを選びます。',
          'MIDI Note: 自分の番号を持たない Cue が使うチャンネル、ノート、ベロシティ。',
          'DAW に合わせる: PAGES を MTC In に切り替えて + を押すと、DAW の MTC に合わせて動くページを作れます。音は DAW が出します。音声のないページは空のトラックになります（長さは設定の Length で、最初は 5 分）。M で Cue を打ち、設定で MTC Input を選びます。ページは DAW に合わせて再生・停止・移動し、MTC オフセットの時間がページの頭になります。MTC が届いている間は、上に MTC IN が赤く点きます（緑の MTC OUT は送信中）。MTC In のページは MTC を送らず、終わりの動作、ページのループ、ループ、オーバーラップもありません。何を流すかは DAW が決めます。曲順と Next は、それぞれの一覧の中で進みます。',
          'Mac では IAC ドライバ（Audio MIDI 設定）で、ほかのアプリに MIDI を送れます。',
          'MIDI Remote（設定）: MIDI の入力を選び、Learn で GO、Play / Stop、Fade Out、Duck、Previous Cue、Next Cue にキー・パッド・ペダルを割り当てます。Note でも CC でも使え、ショーモード中も効きます。MIDI の出力とは別のポートを使ってください。',
          'Audio Output（設定）: アプリの音をすべて出す機材（オーディオインターフェースなど）。この PC に覚えます。Show Names を押すと、Chrome が機材の名前を表示します。',
        ],
      },
      {
        title: 'ファイル',
        points: [
          'フッターには Save だけがあります。New、Import、Export、Save、Backup、Restore、Find Media は設定にあります。',
          'プロジェクトファイル（Save / Export）に音声や映像は入りません。',
          'Backup は、プロジェクトとすべてのメディアをフォルダに書き出します。Restore で、別の PC でもそのまま開けます。',
          'Find Media: Import のあと、元のファイルがあるフォルダを選ぶと、見つからないメディアをファイル名で探して割り当てます。',
        ],
      },
      {
        title: '知っておくこと',
        points: [
          'オーバーラップ機能は Audio ファイル用です。鳴り残るのは音だけで、映像は重なりません。',
          'イン点 / アウト点の外の Cue は、GO で飛ばされ、MIDI Note も送りません。',
          'エリアの境界線はドラッグで幅を変えられます。境界線をダブルクリックすると元の幅に戻ります。',
          'アプリは 1 つのタブだけで開いてください。2 つで開くと保存が上書きし合うので、黄色い警告が出ます。',
          '右下に Offline Ready と出ていれば、この PC では接続がなくてもアプリを開いたり再読み込みしたりできます。',
        ],
      },
    ],
  },
};

function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'ja' ? 'ja' : 'en';
  } catch {
    return 'en';
  }
}

/** The help dialog: English first, with a switch to Japanese that is remembered in this browser. */
export function createHelp() {
  const dialog = h('dialog', { class: 'help' });
  let lang = loadLang();

  function render(): void {
    const text = HELP[lang];
    const switchLang = h(
      'button',
      {
        type: 'button',
        class: 'small',
        onclick: () => {
          lang = lang === 'en' ? 'ja' : 'en';
          try {
            localStorage.setItem(LANG_KEY, lang);
          } catch {
            // Not remembering the language is fine.
          }
          render();
        },
      },
      text.switchTo,
    );
    dialog.lang = lang;
    dialog.replaceChildren(
      h(
        'form',
        { class: 'settings', method: 'dialog' },
        h('div', { class: 'help-head' }, h('h2', {}, text.title), switchLang),
        ...text.sections.flatMap((section) => [
          h('h3', {}, section.title),
          section.rows
            ? h(
                'dl',
                { class: 'help-rows' },
                ...section.rows.flatMap(([key, what]) => [h('dt', {}, key), h('dd', {}, what)]),
              )
            : null,
          section.points ? h('ul', { class: 'help-points' }, ...section.points.map((p) => h('li', {}, p))) : null,
        ]),
        h('div', { class: 'actions' }, h('button', { value: 'close' }, text.close)),
      ),
    );
  }

  function open(): void {
    render();
    dialog.showModal();
  }

  return { element: dialog, open };
}
