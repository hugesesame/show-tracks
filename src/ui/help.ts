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
          'It sends MTC from the playback time.',
          'Chrome only. Media and the project are kept in this browser.',
        ],
      },
      {
        title: 'Keyboard',
        rows: [
          ['Space', 'Play / stop'],
          ['G', 'GO: play from the cue on standby'],
          ['Esc', 'Stop (also silences a page still ringing out)'],
          ['M', 'Add a cue at the playhead'],
          ['← / →', 'Previous / next cue'],
          ['↑ / ↓', 'Previous / next cue, in Cue List order'],
          ['⌥ ← / ⌥ →,  [ / ]', 'Back / forward 5 seconds'],
          ['⌥ ↑ / ⌥ ↓', 'Previous / next page'],
          ['Home', 'Go to the in point (start)'],
          ['I / O', 'In / out point at the playhead (⌥ clears)'],
          ['X', 'Overlap mark at the playhead (⌥ clears)'],
          ['= / -', 'Zoom the track in / out'],
          ['F', 'Fullscreen'],
          ['⌘S / ⇧⌘S', 'Save / save to a new file'],
          ['⌘,', 'Settings'],
          ['?', 'This help'],
        ],
      },
      {
        title: 'Track',
        rows: [
          ['Click / drag', 'Move the playhead'],
          ['Drag a cue', 'Move the cue'],
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
        ],
      },
      {
        title: 'Cue List',
        rows: [
          ['Blue row', 'The cue playing. As playback passes a cue, the standby moves on to the next one'],
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
          ['Video', 'The video; + Memo lays the memos over it'],
          ['Mixer', 'Audio, Video and Master faders with pan and mute; double-click resets'],
          ['Memo', 'The memo of the last cue passed (lyrics, prompts); ⚙ shows the settings'],
          ['Output', 'Also show the memos on the video output'],
          ['Open video output', 'A window for the second display; double-click it or press F for fullscreen'],
        ],
      },
      {
        title: 'MTC and MIDI',
        points: [
          'Settings: choose the MIDI output, the MTC frame rate and each page’s MTC offset.',
          'MIDI Note: channel, note and velocity used by cues without their own note.',
          'On a Mac, the IAC Driver (Audio MIDI Setup) sends MIDI to other apps.',
        ],
      },
      {
        title: 'Files',
        points: [
          'New / Import / Export / Save are in the footer and Settings.',
          'Project files do not include audio or video. On another computer, choose the media again on each page.',
        ],
      },
      {
        title: 'Good to know',
        points: [
          'The overlap mark is for audio files: only the audio rings out; the video does not overlap.',
          'Cues outside the in / out points are skipped by GO and send no MIDI Notes.',
          'When Offline ready shows at the bottom right, the app also opens and reloads on this computer without a connection.',
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
          '再生時間で MTC を出力します。',
          'Chrome 専用です。メディアとプロジェクトは、このブラウザの中に保存されます。',
        ],
      },
      {
        title: 'キーボード',
        rows: [
          ['Space', '再生 / 停止'],
          ['G', 'GO: 待機中の Cue から再生'],
          ['Esc', '停止（鳴り残っている前のページの音も止める）'],
          ['M', '再生位置に Cue を追加'],
          ['← / →', '前 / 次の Cue へ'],
          ['↑ / ↓', 'Cue List の順で前 / 次の Cue へ'],
          ['⌥ ← / ⌥ →、[ / ]', '5 秒戻る / 進む'],
          ['⌥ ↑ / ⌥ ↓', '前 / 次のページへ'],
          ['Home', 'イン点（頭）へ'],
          ['I / O', '再生位置をイン点 / アウト点に（⌥ で解除）'],
          ['X', '再生位置にオーバーラップのマーク（⌥ で解除）'],
          ['= / -', 'トラックの拡大 / 縮小'],
          ['F', '全画面'],
          ['⌘S / ⇧⌘S', '保存 / 別のファイルに保存'],
          ['⌘,', '設定'],
          ['?', 'このヘルプ'],
        ],
      },
      {
        title: 'トラック',
        rows: [
          ['クリック / ドラッグ', '再生位置を動かす'],
          ['Cue をドラッグ', 'Cue を動かす'],
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
        ],
      },
      {
        title: 'Cue List',
        rows: [
          ['青い行', '再生中の Cue。再生が Cue を通過すると、待機は次の Cue に進む'],
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
          ['Video', '映像。+ Memo で映像の上にメモを重ねる'],
          ['Mixer', 'Audio、Video、Master のフェーダー、Pan、ミュート。ダブルクリックで元に戻る'],
          ['Memo', '最後に通過した Cue のメモ（歌詞、カンペ）。⚙ で設定を表示'],
          ['Output', '外部モニターにもメモを出す'],
          ['Open video output', '外部モニター用のウィンドウ。ダブルクリックか F で全画面'],
        ],
      },
      {
        title: 'MTC と MIDI',
        points: [
          '設定で、MIDI の出力先、MTC のフレームレート、ページごとの MTC オフセットを選びます。',
          'MIDI Note: 自分の番号を持たない Cue が使うチャンネル、ノート、ベロシティ。',
          'Mac では IAC ドライバ（Audio MIDI 設定）で、ほかのアプリに MIDI を送れます。',
        ],
      },
      {
        title: 'ファイル',
        points: [
          'New / Import / Export / Save は、フッターと設定にあります。',
          'プロジェクトファイルに音声や映像は入りません。別の PC では、各ページでメディアを選び直してください。',
        ],
      },
      {
        title: '知っておくこと',
        points: [
          'オーバーラップ機能は Audio ファイル用です。鳴り残るのは音だけで、映像は重なりません。',
          'イン点 / アウト点の外の Cue は、GO で飛ばされ、MIDI Note も送りません。',
          '右下に Offline ready と出ていれば、この PC では接続がなくてもアプリを開いたり再読み込みしたりできます。',
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
