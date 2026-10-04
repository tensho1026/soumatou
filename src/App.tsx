import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Film,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DEFAULT_SETTINGS,
  buildTimeline,
  dimensions,
  formatTime,
  sceneAt,
  type Memory,
  type Settings,
} from "./timeline";
import {
  DEMO_PHOTOS,
  MAX_FILES,
  demoMemories,
  importFile,
  releaseMemory,
} from "./media";
import { drawFrame } from "./renderer";
import { createScore } from "./audio";
import { DEFAULT_LOOK, LOOK_CONTROLS, type LookAdjustments } from "./look";

export default function App() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0.75);
  const [muted, setMuted] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    url: string;
    extension: string;
    size: number;
    poster: string;
  } | null>(null);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"memories" | "settings">(
    "memories",
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const resultVideoRef = useRef<HTMLVideoElement>(null);
  const timeRef = useRef(time);
  const memoriesRef = useRef(memories);
  const pendingFrame = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const busy = exporting || importing;
  const scenes = useMemo(
    () => buildTimeline(memories, settings),
    [memories, settings],
  );
  const currentScene = sceneAt(scenes, time);
  memoriesRef.current = memories;
  timeRef.current = time;

  useEffect(
    () => () => {
      memoriesRef.current.forEach(releaseMemory);
      abortRef.current?.abort();
      void audioRef.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (!result) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result]);
  useEffect(() => {
    if (!help) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.getElementById("help-close")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setHelp(false);
      if (event.key === "Tab") {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(".help-modal button"),
        );
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus();
    };
  }, [help]);
  useEffect(() => {
    setResult(null);
    setPlaying(false);
    setTime(0.75);
  }, [memories]);
  useEffect(() => {
    setResult(null);
    setPlaying(false);
    setTime((previous) => Math.min(previous, settings.duration - 0.05));
  }, [settings]);
  useEffect(() => {
    if (!scenes.length || exporting || result || !canvasRef.current) return;
    let canceled = false;
    let frameId = 0;
    const canvas = canvasRef.current;
    [canvas.width, canvas.height] = dimensions(settings.ratio);
    const started = performance.now();
    const offset = timeRef.current;
    async function render() {
      if (canceled) return;
      const target = playing
        ? Math.min(
            settings.duration,
            offset + (performance.now() - started) / 1000,
          )
        : timeRef.current;
      try {
        await drawFrame(canvas, scenes, settings, target);
        if (canceled) return;
        if (playing) {
          setTime(target);
          if (target >= settings.duration) setPlaying(false);
          else
            frameId = requestAnimationFrame(() => {
              pendingFrame.current = render();
            });
        }
      } catch (e) {
        if (!canceled) {
          setPlaying(false);
          setError(
            e instanceof Error
              ? e.message
              : "プレビューを表示できませんでした。",
          );
        }
      }
    }
    // Serialize drawing when scrubbing quickly or switching settings during a video seek.
    pendingFrame.current = pendingFrame.current.catch(() => {}).then(render);
    return () => {
      canceled = true;
      cancelAnimationFrame(frameId);
    };
  }, [scenes, settings, playing, exporting, result, playing ? null : time]);

  useEffect(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    if (!playing || muted || settings.music === "none") return;
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    const source = context.createBufferSource();
    source.buffer = createScore(settings.duration, settings.music);
    source.connect(context.destination);
    void context
      .resume()
      .then(() => {
        if (sourceRef.current === source)
          source.start(0, Math.min(timeRef.current, settings.duration - 0.01));
      })
      .catch(() =>
        setError("BGMを再生できませんでした。もう一度再生してください。"),
      );
    sourceRef.current = source;
    return () => {
      if (sourceRef.current === source) {
        source.stop();
        sourceRef.current = null;
      }
    };
  }, [playing, muted, settings.music, settings.duration]);

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!busy) setSettings((previous) => ({ ...previous, [key]: value }));
  }
  function updateLook(key: keyof LookAdjustments, value: number) {
    if (!busy)
      setSettings((previous) => ({
        ...previous,
        look: { ...previous.look, [key]: value },
      }));
  }
  function togglePlay() {
    if (!memories.length || busy) return;
    if (time >= settings.duration - 0.1) setTime(0);
    setPlaying((value) => !value);
  }
  async function addFiles(files: File[]) {
    if (busy || !files.length) return;
    setImporting(true);
    setPlaying(false);
    setError("");
    const existing = memories.filter((memory) => !memory.demo);
    const slots = MAX_FILES - existing.length;
    const errors: string[] = [];
    if (files.length > slots)
      errors.push(
        `一度に使える素材は${MAX_FILES}個までです。先頭から${slots}個を読み込みました。`,
      );
    const added: Memory[] = [];
    for (const file of files.slice(0, Math.max(0, slots))) {
      try {
        added.push(await importFile(file));
      } catch (e) {
        errors.push(
          e instanceof Error ? e.message : "ファイルを読み込めませんでした。",
        );
      }
    }
    if (added.length) {
      memories.filter((memory) => memory.demo).forEach(releaseMemory);
      setMemories([...existing, ...added]);
    }
    setError(errors.join("\n"));
    setImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  }
  async function loadDemo() {
    if (busy || memories.some((memory) => !memory.demo)) return;
    setImporting(true);
    setError("");
    try {
      setMemories(await demoMemories());
    } catch {
      setError(
        "サンプルを読み込めませんでした。ページを再読み込みしてください。",
      );
    } finally {
      setImporting(false);
    }
  }
  function removeMemory(id: string) {
    if (busy) return;
    setPlaying(false);
    void pendingFrame.current.then(() => {
      const memory = memories.find((item) => item.id === id);
      if (memory) releaseMemory(memory);
    });
    setMemories((previous) => previous.filter((memory) => memory.id !== id));
    if (settings.endingId === id)
      setSettings((previous) => ({ ...previous, endingId: "" }));
  }
  function moveMemory(id: string, shift: number) {
    if (busy) return;
    setMemories((previous) => {
      const next = [...previous];
      const from = next.findIndex((memory) => memory.id === id);
      const to = from + shift;
      if (from < 0 || to < 0 || to >= next.length) return previous;
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }
  async function generate() {
    if (busy || !memories.length) return;
    setPlaying(false);
    setExporting(true);
    setProgress(0);
    setError("");
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await pendingFrame.current;
      const { exportFilm } = await import("./export");
      const film = await exportFilm(
        scenes,
        { ...settings },
        setProgress,
        controller.signal,
      );
      setTime(0);
      setResult({
        url: URL.createObjectURL(film.blob),
        extension: film.extension,
        size: film.blob.size,
        poster: film.poster,
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError(
          e instanceof Error
            ? e.message
            : "書き出しに失敗しました。もう一度お試しください。",
        );
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      setError("このブラウザでは全画面表示を利用できません。");
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a href="#" className="brand" aria-label="走馬灯 ホーム">
          <span className="brand-mark">
            <Film size={21} strokeWidth={1.3} />
          </span>
          <span className="brand-name">走馬灯</span>
          <span className="brand-roman">SOUMATOU</span>
        </a>
        <nav>
          <span className="local-badge">
            <span /> あなたの端末の中だけで
          </span>
          <button
            className="text-button help-button"
            onClick={() => setHelp(true)}
          >
            使い方 <ArrowUpRight size={14} />
          </button>
        </nav>
      </header>

      <main>
        <section className="intro">
          <p className="eyebrow">
            <span /> A LITTLE FILM OF YOUR LIFE
          </p>
          <h1>
            思い出が、<span>駆け巡る。</span>
          </h1>
          <p className="intro-description">
            何気ない一日も、忘れられない瞬間も。
            <br className="mobile-break" />{" "}
            写真と動画から、あなただけの走馬灯を。
          </p>
          <span className="intro-note">あの日の光を、もう一度。</span>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              aria-label="メッセージを閉じる"
              onClick={() => setError("")}
            >
              <X size={17} />
            </button>
          </div>
        )}

        <div className="mobile-tabs">
          <button
            className={mobilePanel === "memories" ? "active" : ""}
            onClick={() => setMobilePanel("memories")}
          >
            01 思い出
          </button>
          <button
            className={mobilePanel === "settings" ? "active" : ""}
            onClick={() => setMobilePanel("settings")}
          >
            02 演出
          </button>
        </div>
        <div className="workspace">
          <aside className={`memories-panel panel mobile-${mobilePanel}`}>
            <div className="panel-title">
              <h2>
                <span>01</span> 思い出を集める
              </h2>
              <span className="count">
                {memories.length.toString().padStart(2, "0")}{" "}
                <span>/ {MAX_FILES}</span>
              </span>
            </div>
            <input
              ref={inputRef}
              type="file"
              aria-label="写真・動画を追加"
              accept="image/*,video/*"
              multiple
              disabled={busy}
              className="file-input"
              onChange={(event) =>
                void addFiles(Array.from(event.target.files ?? []))
              }
            />
            <button
              className={`dropzone ${dragging ? "dragging" : ""}`}
              disabled={
                busy || memories.filter((m) => !m.demo).length >= MAX_FILES
              }
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <span className="upload-icon">
                {importing ? (
                  <LoaderCircle className="spin" size={23} />
                ) : (
                  <ImagePlus size={23} strokeWidth={1.3} />
                )}
              </span>
              <strong>
                {importing ? "思い出を読み込んでいます…" : "写真・動画を追加"}
              </strong>
              <span>クリック、またはここにドロップ</span>
              <small>JPEG・PNG・MP4など / 1つ100MBまで</small>
            </button>
            <div className="collection-meta">
              <span>
                {memories.length
                  ? memories.every((m) => m.demo)
                    ? "サンプルの思い出"
                    : "あなたの思い出"
                  : "まだ、白紙のフィルム。"}
              </span>
              {memories.length > 0 && (
                <span className="tiny">
                  <GripVertical size={12} /> 並べ替え
                </span>
              )}
            </div>
            <div
              className={`memory-grid ${memories.length ? "" : "empty-grid"}`}
            >
              {memories.length ? (
                memories.map((memory, index) => (
                  <article
                    key={memory.id}
                    className={`memory-card ${settings.endingId === memory.id ? "is-ending" : ""}`}
                    draggable={!busy}
                    onDragStart={() => setDragId(memory.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (dragId && dragId !== memory.id) {
                        const from = memories.findIndex((m) => m.id === dragId);
                        moveMemory(dragId, index - from);
                      }
                      setDragId(null);
                    }}
                  >
                    {memory.kind === "image" ? (
                      <img src={memory.url} alt={memory.name} loading="lazy" />
                    ) : (
                      <video
                        src={memory.url}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                    <span className="memory-number">
                      {(index + 1).toString().padStart(2, "0")}
                    </span>
                    {memory.kind === "video" && (
                      <span className="video-badge">
                        <Film size={11} /> {formatTime(memory.duration)}
                      </span>
                    )}
                    <button
                      disabled={busy}
                      className={`favorite-button ${memory.favorite ? "selected" : ""}`}
                      title="大切な瞬間は長めに映します"
                      aria-label={`${memory.name}を大切な瞬間にする`}
                      aria-pressed={memory.favorite}
                      onClick={() =>
                        setMemories((previous) =>
                          previous.map((item) =>
                            item.id === memory.id
                              ? { ...item, favorite: !item.favorite }
                              : item,
                          ),
                        )
                      }
                    >
                      <Star
                        size={13}
                        fill={memory.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <div className="memory-actions">
                      <button
                        disabled={busy || index === 0}
                        onClick={() => moveMemory(memory.id, -1)}
                        aria-label={`${memory.name}を前へ`}
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <button
                        disabled={busy || index === memories.length - 1}
                        onClick={() => moveMemory(memory.id, 1)}
                        aria-label={`${memory.name}を後ろへ`}
                      >
                        <ArrowRight size={13} />
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => removeMemory(memory.id)}
                        aria-label={`${memory.name}を削除`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {settings.endingId === memory.id && (
                      <span className="ending-label">最後の一枚</span>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-memories">
                  <div className="empty-frame">
                    <Film size={29} strokeWidth={1} />
                  </div>
                  <p>あなたの記憶を、ここに。</p>
                  <span>
                    写真も、短い動画も。
                    <br />
                    順番は、あとから変えられます。
                  </span>
                </div>
              )}
            </div>
            {memories.length > 0 && (
              <p className="star-hint">
                <Star size={12} /> 大切な瞬間に星をつけると、長めに映ります。
              </p>
            )}
            {!memories.some((memory) => !memory.demo) && (
              <button
                className="demo-button"
                disabled={busy}
                onClick={() => void loadDemo()}
              >
                <Sparkles size={14} />{" "}
                {memories.length
                  ? "サンプルをもう一度読み込む"
                  : "まずはサンプルで試す"}{" "}
                <ArrowUpRight size={14} />
              </button>
            )}
            <div className="privacy-note">
              <ShieldCheck size={15} />
              <p>
                思い出は、あなたのもの。
                <br />
                <span>素材をサーバーに送ることはありません。</span>
              </p>
            </div>
          </aside>

          <section className="preview-panel">
            <div className="preview-heading">
              <h2>
                <span className="live-dot" />{" "}
                {result ? "できあがった走馬灯" : "あなたの走馬灯"}
              </h2>
              <span>
                {settings.ratio === "landscape"
                  ? "16:9"
                  : settings.ratio === "portrait"
                    ? "9:16"
                    : "1:1"}{" "}
                <span> / </span>{" "}
                {result ? result.extension.toUpperCase() : "PREVIEW"}
              </span>
            </div>
            <div
              ref={stageRef}
              className={`film-stage ratio-${settings.ratio}`}
            >
              <div className="film-perforations top" aria-hidden="true" />
              {result ? (
                <video
                  ref={resultVideoRef}
                  className="result-video"
                  src={result.url}
                  poster={result.poster}
                  controls
                  playsInline
                  aria-label="完成した走馬灯"
                  onTimeUpdate={(event) =>
                    setTime(event.currentTarget.currentTime)
                  }
                />
              ) : memories.length ? (
                <canvas
                  ref={canvasRef}
                  className="film-canvas"
                  aria-label="走馬灯のプレビュー"
                  style={{
                    aspectRatio:
                      settings.ratio === "landscape"
                        ? "16 / 9"
                        : settings.ratio === "portrait"
                          ? "9 / 16"
                          : "1 / 1",
                  }}
                />
              ) : (
                <div className="placeholder-film">
                  <img
                    src={`/demo/${DEMO_PHOTOS[0][0]}.jpg`}
                    alt="夕暮れの旅の風景"
                  />
                  <div className="placeholder-shade" />
                  <div className="placeholder-copy">
                    <span>EVERY MOMENT, STILL WITH YOU.</span>
                    <p>
                      あの瞬間が、
                      <br />
                      今も、ここに。
                    </p>
                    <button onClick={() => void loadDemo()} disabled={busy}>
                      <Play size={13} fill="currentColor" /> サンプルで試す
                    </button>
                  </div>
                  <span className="film-caption">YOUR MEMORIES, IN MOTION</span>
                </div>
              )}
              {memories.length > 0 && !result && !playing && !exporting && (
                <button
                  className="center-play"
                  onClick={togglePlay}
                  aria-label="プレビューを再生"
                >
                  <Play size={24} fill="currentColor" />
                </button>
              )}
              {exporting && (
                <div className="export-overlay" role="status">
                  <span className="export-icon">
                    <Film size={28} strokeWidth={1.2} />
                  </span>
                  <p>記憶を、つないでいます。</p>
                  <span>このページを開いたまま、お待ちください。</span>
                  <div className="export-progress">
                    <i style={{ width: `${progress * 100}%` }} />
                  </div>
                  <strong>
                    {Math.round(progress * 100)}
                    <small>%</small>
                  </strong>
                  <button
                    className="text-button"
                    onClick={() => abortRef.current?.abort()}
                  >
                    書き出しをキャンセル
                  </button>
                </div>
              )}
              <div className="film-perforations bottom" aria-hidden="true" />
            </div>
            {!result && (
              <div className="player-controls">
                <button
                  onClick={togglePlay}
                  disabled={!memories.length || busy}
                  aria-label={playing ? "一時停止" : "再生"}
                >
                  {playing ? (
                    <Pause size={18} fill="currentColor" />
                  ) : (
                    <Play size={17} fill="currentColor" />
                  )}
                </button>
                <span className="time-display">
                  {formatTime(memories.length ? time : 0)}{" "}
                  <span>/ {formatTime(settings.duration)}</span>
                </span>
                <input
                  className="playhead"
                  aria-label="再生位置"
                  type="range"
                  min="0"
                  max={settings.duration}
                  step="0.05"
                  value={memories.length ? time : 0}
                  disabled={!memories.length || busy}
                  onChange={(event) => {
                    setPlaying(false);
                    setTime(Number(event.target.value));
                  }}
                  style={
                    {
                      "--progress": `${(time / settings.duration) * 100}%`,
                    } as React.CSSProperties
                  }
                />
                <button
                  onClick={() => setMuted((value) => !value)}
                  aria-label={muted ? "BGMをオン" : "BGMをミュート"}
                >
                  {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
                <button
                  onClick={() => void fullscreen()}
                  aria-label="全画面表示"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            )}
            <div className="timeline-section">
              <div className="timeline-heading">
                <span>記憶の流れ</span>
                <span>
                  {currentScene?.phase === "opening"
                    ? "静かな始まり"
                    : currentScene?.phase === "ending"
                      ? "最後の余韻"
                      : "記憶が駆け巡る"}
                </span>
              </div>
              <div className="timeline-track">
                {scenes.length
                  ? scenes.map((scene, index) => (
                      <button
                        key={index}
                        className={`scene-block ${scene.phase} ${currentScene === scene ? "current" : ""}`}
                        style={{
                          flex: scene.end - scene.start,
                          backgroundImage:
                            scene.memory.kind === "image"
                              ? `url("${scene.memory.url}")`
                              : undefined,
                        }}
                        disabled={busy}
                        aria-label={`${formatTime(scene.start)} ${scene.memory.name}へ移動`}
                        onClick={() => {
                          setPlaying(false);
                          setTime(scene.start + 0.05);
                          if (resultVideoRef.current)
                            resultVideoRef.current.currentTime =
                              scene.start + 0.05;
                        }}
                      />
                    ))
                  : Array.from({ length: 18 }, (_, index) => (
                      <div
                        className="empty-scene"
                        key={index}
                        style={{ flex: 2 - index / 12 }}
                      />
                    ))}
              </div>
              <div className="timeline-labels">
                <span>静かに浮かぶ</span>
                <span>
                  少しずつ、速く <ArrowRight size={12} />
                </span>
                <span>余韻を残す</span>
              </div>
            </div>
            <div className="preview-footnote">
              <span className="preview-spark">✧</span>
              <p>
                時間は戻らなくても、
                <br />
                <span>思い出には、いつでも帰れる。</span>
              </p>
            </div>
          </section>

          <aside className={`settings-panel panel mobile-${mobilePanel}`}>
            <div className="panel-title">
              <h2>
                <span>02</span> 余韻をととのえる
              </h2>
              <Sparkles size={15} />
            </div>
            <fieldset disabled={busy}>
              <div className="setting-group">
                <label>走馬灯の長さ</label>
                <div className="segmented">
                  {[15, 30, 60].map((duration) => (
                    <button
                      key={duration}
                      className={settings.duration === duration ? "active" : ""}
                      onClick={() => updateSetting("duration", duration)}
                      aria-pressed={settings.duration === duration}
                    >
                      {duration}
                      <small>秒</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="setting-group">
                <label>フレーム</label>
                <div className="ratio-options">
                  {(["landscape", "portrait", "square"] as const).map(
                    (ratio) => (
                      <button
                        key={ratio}
                        onClick={() => updateSetting("ratio", ratio)}
                        className={settings.ratio === ratio ? "active" : ""}
                        aria-pressed={settings.ratio === ratio}
                      >
                        <span className={`ratio-icon ${ratio}`} />
                        {ratio === "landscape"
                          ? "横"
                          : ratio === "portrait"
                            ? "縦"
                            : "正方形"}
                        <small>
                          {ratio === "landscape"
                            ? "16:9"
                            : ratio === "portrait"
                              ? "9:16"
                              : "1:1"}
                        </small>
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="setting-group">
                <label>記憶の色</label>
                <div className="mood-options">
                  {(
                    [
                      {
                        id: "nostalgia",
                        name: "懐かしい",
                        description: "あたたかく、フィルムのように",
                      },
                      {
                        id: "dream",
                        name: "夢の中",
                        description: "やわらかく、淡い記憶",
                      },
                      {
                        id: "clear",
                        name: "ありのまま",
                        description: "あの日の色を、そのまま",
                      },
                    ] as const
                  ).map((mood) => (
                    <button
                      key={mood.id}
                      onClick={() => updateSetting("mood", mood.id)}
                      className={settings.mood === mood.id ? "active" : ""}
                      aria-pressed={settings.mood === mood.id}
                    >
                      <span className={`mood-swatch ${mood.id}`} />
                      <span>
                        <strong>{mood.name}</strong>
                        <small>{mood.description}</small>
                      </span>
                      <span className="radio-dot">
                        {settings.mood === mood.id && <Check size={11} />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <details className="look-adjustments" open>
                <summary>
                  色と光を調整 <ChevronDown size={13} />
                </summary>
                <p className="look-description">
                  映像全体に反映されます。白ボケで、白い光がにじむような余韻を。
                </p>
                <div className="look-sliders">
                  {LOOK_CONTROLS.map((control) => (
                    <div className="look-control" key={control.key}>
                      <div className="look-label">
                        <label htmlFor={`look-${control.key}`}>
                          {control.label}
                        </label>
                        <output htmlFor={`look-${control.key}`}>
                          {settings.look[control.key] > 0 && control.min < 0
                            ? "+"
                            : ""}
                          {settings.look[control.key]}
                        </output>
                      </div>
                      <input
                        id={`look-${control.key}`}
                        type="range"
                        min={control.min}
                        max={control.max}
                        step="1"
                        value={settings.look[control.key]}
                        onChange={(event) =>
                          updateLook(control.key, Number(event.target.value))
                        }
                        style={
                          {
                            "--look-progress": `${((settings.look[control.key] - control.min) / (control.max - control.min)) * 100}%`,
                          } as React.CSSProperties
                        }
                      />
                      <div className="look-endpoints">
                        <span>{control.low}</span>
                        <span>{control.high}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="look-reset"
                  onClick={() => updateSetting("look", { ...DEFAULT_LOOK })}
                >
                  <RotateCcw size={12} /> 色と光を初期値に戻す
                </button>
              </details>
              <div className="setting-group compact-group">
                <label htmlFor="music">思い出に添える音</label>
                <div className="select-wrap">
                  <Music2 size={15} />
                  <select
                    id="music"
                    value={settings.music}
                    onChange={(event) =>
                      updateSetting(
                        "music",
                        event.target.value as Settings["music"],
                      )
                    }
                  >
                    <option value="piano">静かなピアノ</option>
                    <option value="ambient">浮遊するアンビエント</option>
                    <option value="none">音をつけない</option>
                  </select>
                  <ChevronDown size={13} />
                </div>
                <small className="setting-note">
                  動画の元の音声は含めません。
                </small>
              </div>
              <div className="setting-group compact-group">
                <label htmlFor="order">思い出の順番</label>
                <div className="select-wrap">
                  <select
                    id="order"
                    value={settings.order}
                    onChange={(event) =>
                      updateSetting(
                        "order",
                        event.target.value as Settings["order"],
                      )
                    }
                  >
                    <option value="mixed">記憶が交差する順番</option>
                    <option value="selected">並べた順番</option>
                  </select>
                  <ChevronDown size={13} />
                </div>
              </div>
              <div className="setting-group compact-group">
                <label htmlFor="ending">最後に残す一枚</label>
                <div className="select-wrap">
                  <select
                    id="ending"
                    value={settings.endingId}
                    onChange={(event) =>
                      updateSetting("endingId", event.target.value)
                    }
                  >
                    <option value="">最後の素材を使う</option>
                    {memories.map((memory, index) => (
                      <option key={memory.id} value={memory.id}>
                        {index + 1}. {memory.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                </div>
              </div>
              <label className="grain-toggle">
                <span>フィルムの粒子</span>
                <input
                  type="checkbox"
                  checked={settings.grain}
                  onChange={(event) =>
                    updateSetting("grain", event.target.checked)
                  }
                />
                <span className="toggle-track" />
              </label>
            </fieldset>
          </aside>
        </div>

        <section className="creation-bar">
          <div>
            <span className="creation-icon">
              <Film size={20} strokeWidth={1.2} />
            </span>
            <p>
              {result
                ? "あなたの走馬灯が、できました。"
                : memories.length
                  ? `${memories.length}個の思い出を、一本の走馬灯に。`
                  : "思い出を選んだら、あとはおまかせ。"}
              <small>
                {result
                  ? `${result.extension.toUpperCase()} · ${(result.size / 1024 / 1024).toFixed(1)} MB · ${settings.duration}秒`
                  : "静かな始まり。駆け巡る記憶。最後に、余韻。"}
              </small>
            </p>
          </div>
          <div className="creation-actions">
            {result ? (
              <>
                <button className="text-button" onClick={() => setResult(null)}>
                  <RotateCcw size={14} /> 編集に戻る
                </button>
                <a
                  className="primary-button"
                  href={result.url}
                  download={`soumatou-${new Date().toLocaleDateString("sv-SE")}.${result.extension}`}
                >
                  <ArrowDownToLine size={17} /> 動画を保存する
                </a>
              </>
            ) : (
              <>
                <span className="export-details">
                  {settings.duration}秒 <span>·</span> 1080p
                </span>
                <button
                  className="primary-button"
                  disabled={!memories.length || busy}
                  onClick={() => void generate()}
                >
                  {exporting ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Sparkles size={17} />
                  )}{" "}
                  {exporting
                    ? `書き出し中 ${Math.round(progress * 100)}%`
                    : "走馬灯をつくる"}{" "}
                  {!exporting && <ArrowRight size={16} />}
                </button>
              </>
            )}
          </div>
        </section>
        <p className="session-note">
          素材と編集内容は、このページを閉じると消えます。完成した動画を保存してください。
        </p>
      </main>
      <footer>
        <span>
          走馬灯 <small>SOUMATOU</small>
        </span>
        <span>過ぎた時間に、もう一度会いに。</span>
        <span>
          MADE FOR YOUR MEMORIES <span className="footer-star">✧</span>
        </span>
      </footer>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              id="help-close"
              className="modal-close"
              aria-label="使い方を閉じる"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <p className="eyebrow">THREE LITTLE STEPS</p>
            <h2 id="help-title">あなたの走馬灯をつくる。</h2>
            <ol>
              <li>
                <ImagePlus size={20} />
                <div>
                  <strong>思い出を集める</strong>
                  <p>
                    写真や動画を24個まで追加。星をつけると、その瞬間が長めに映ります。サンプルでも試せます。
                  </p>
                </div>
              </li>
              <li>
                <Sparkles size={20} />
                <div>
                  <strong>余韻をととのえる</strong>
                  <p>
                    長さ、色、BGM、最後に残す一枚を選びます。横・縦・正方形に対応しています。
                  </p>
                </div>
              </li>
              <li>
                <ArrowDownToLine size={20} />
                <div>
                  <strong>つくって、保存する</strong>
                  <p>
                    完成した動画を確認して保存。MP4に対応しないブラウザではWebMで書き出します。ページを閉じる前に保存してください。
                  </p>
                </div>
              </li>
            </ol>
            <p className="help-privacy">
              <ShieldCheck size={16} />{" "}
              素材は端末内で処理され、外部に送信されません。
            </p>
            <button className="primary-button" onClick={() => setHelp(false)}>
              はじめる <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
