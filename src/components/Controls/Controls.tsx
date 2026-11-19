import React, { useEffect, useMemo, useState } from "react";
import { Badge, Popover, Slider } from "@mantine/core";
import { formatTimestamp } from "../../utils/utils";
import styles from "./Controls.module.css";
import type { AudioTrackInfo } from "../../utils/clientTranscode";
import { t } from "../../i18n";
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconRefresh,
  IconCheck,
  IconRepeat,
  IconBadgeCc,
  IconHeadphones,
  IconVolumeOff,
  IconVolume,
  IconTheater,
  IconMaximize,
  IconPlayerSkipForwardFilled,
  IconSettings,
  IconMessageCircle,
  IconPictureInPicture,
} from "@tabler/icons-react";

interface ControlsProps {
  roomControls?: boolean;
  duration: number;
  video: string;
  paused: boolean;
  muted: boolean;
  volume: number;
  subtitled: boolean;
  currentTime: number;
  disabled?: boolean;
  leaderTime?: number;
  isPauseDisabled?: boolean;
  playbackRate: number;
  roomPlaybackRate: number;
  isYouTube: boolean;
  isLiveStream: boolean;
  timeRanges: { start: number; end: number }[];
  loop: boolean;
  roomTogglePlay: () => void;
  roomSeek: (time: number) => void;
  roomSetPlaybackRate: (rate: number) => void;
  roomSetLoop: (loop: boolean) => void;
  localFullScreen: (fs: boolean) => void;
  localToggleMute: () => void;
  localSubtitleModal: () => void;
  localSeek: () => void;
  /** Detached floating player (Picture-in-Picture); hidden where the browser has none */
  localPictureInPicture?: () => void;
  localSetVolume: (volume: number) => void;
  localSetSubtitleMode: (mode: TextTrackMode, lang?: string) => void;
  roomPlaylistPlay: (index: number) => void;
  playlist: PlaylistVideo[];
  /** Audio tracks of the file being converted on this device (only set when there's a choice to make) */
  audioTracks?: AudioTrackInfo[];
  audioTrackId?: number;
  localSetAudioTrack?: (id: number) => void;
  commentsEnabled?: boolean;
  onToggleComments?: () => void;
}

export const Controls = (props: ControlsProps) => {
  const [hoverState, setHoverState] = useState({ timestamp: 0, position: 0 });
  const [showTimestamp, setShowTimestamp] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [sliderVolume, setSliderVolume] = useState(props.volume);
  useEffect(() => setSliderVolume(props.volume), [props.volume]);
  const {
    duration,
    currentTime,
    leaderTime,
    disabled,
    isPauseDisabled,
    isLiveStream,
    paused,
    muted,
    subtitled,
  } = props;
  const hasFiniteDuration = Number.isFinite(duration);
  const canSeek = hasFiniteDuration && duration > 0 && !disabled && props.roomControls === true;
  const progress =
    hasFiniteDuration && duration > 0 && Number.isFinite(currentTime)
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;
  // Media time 0 corresponds to this wall-clock time for live streams. Wait
  // for a finite duration before establishing it, including for DASH streams.
  const zeroTime = useMemo(
    () =>
      hasFiniteDuration ? Math.floor(Date.now() / 1000) - duration : undefined,
    [props.video, hasFiniteDuration],
  );
  const hasSyncReference = isLiveStream
    ? hasFiniteDuration
    : leaderTime !== undefined && Number.isFinite(leaderTime);
  const behindTime = isLiveStream
    ? duration - currentTime
    : (leaderTime ?? currentTime) - currentTime;
  const isBehind = hasSyncReference && behindTime > 10;
  const currentLabel = formatTimestamp(
    currentTime,
    isLiveStream ? zeroTime : undefined,
  );
  const durationLabel = formatTimestamp(duration);
  const seekTo = (time: number) => {
    if (canSeek) props.roomSeek(Math.max(0, Math.min(duration, time)));
  };
  const getPointerPosition = (event: React.MouseEvent<HTMLDivElement>) => {
    // Use the track, not a buffered/progress child underneath the pointer.
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width > 0
      ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      : 0;
  };
  const onTimelineKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const position = Number.isFinite(currentTime) ? currentTime : 0;
    let target: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        target = position - 5;
        break;
      case "ArrowRight":
      case "ArrowUp":
        target = position + 5;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = duration;
        break;
      case "PageDown":
        target = position - duration / 10;
        break;
      case "PageUp":
        target = position + duration / 10;
        break;
      default:
        return;
    }
    event.preventDefault();
    seekTo(target);
  };
  const volumeControl = (
    <Slider
      value={sliderVolume}
      onChange={setSliderVolume}
      disabled={muted}
      min={0}
      max={1}
      step={0.01}
      size={3}
      color="#eaa580"
      thumbSize={12}
      thumbLabel="Volume"
      label={(value) => `${Math.round(value * 100)}%`}
      onChangeEnd={props.localSetVolume}
    />
  );

  return (
    <div className={styles.controls} role="group" aria-label={t("controls.videoControls")}>
      <div
        className={styles.timeline}
        role="slider"
        aria-label={t("controls.playbackPosition")}
        aria-valuemin={0}
        aria-valuemax={hasFiniteDuration && duration > 0 ? duration : 0}
        aria-valuenow={hasFiniteDuration ? (progress / 100) * duration : 0}
        aria-valuetext={currentLabel || t("controls.notAvailable")}
        aria-disabled={!canSeek}
        tabIndex={canSeek ? 0 : -1}
        onClick={(event) => seekTo(getPointerPosition(event) * duration)}
        onKeyDown={onTimelineKeyDown}
        onMouseEnter={() => setShowTimestamp(true)}
        onMouseLeave={() => setShowTimestamp(false)}
        onMouseMove={(event) => {
          const position = getPointerPosition(event);
          setHoverState({ timestamp: position * duration, position });
        }}
      >
        <div className={styles.timelineTrack}>
          {hasFiniteDuration &&
            duration > 0 &&
            props.timeRanges.map(({ start, end }) => {
              const left = Math.max(0, Math.min(100, (start / duration) * 100));
              const right = Math.max(
                left,
                Math.min(100, (end / duration) * 100),
              );
              return (
                <span
                  key={start}
                  className={styles.buffer}
                  style={{ left: `${left}%`, width: `${right - left}%` }}
                />
              );
            })}
          <span className={styles.elapsed} style={{ width: `${progress}%` }} />
        </div>
        {hasFiniteDuration && duration > 0 && (
          <span className={styles.playhead} style={{ left: `${progress}%` }} />
        )}
        {hasFiniteDuration && duration > 0 && showTimestamp && (
          <Badge
            className={styles.timelineHint}
            style={{
              left: `${Math.max(10, Math.min(90, hoverState.position * 100))}%`,
            }}
          >
            {formatTimestamp(
              hoverState.timestamp,
              isLiveStream ? zeroTime : undefined,
            )}
          </Badge>
        )}
      </div>
      <div className={styles.controlRow}>
        {props.roomControls && <button
          type="button"
          className={styles.action}
          aria-label={paused ? t("controls.play") : t("controls.pause")}
          title={paused ? "Play" : "Pause"}
          disabled={disabled || isPauseDisabled}
          onClick={props.roomTogglePlay}
        >
          {paused ? (
            <IconPlayerPlayFilled aria-hidden="true" />
          ) : (
            <IconPlayerPauseFilled aria-hidden="true" />
          )}
        </button>}
        <button
          type="button"
          className={styles.action}
          aria-label={muted ? t("controls.unmute") : t("controls.mute")}
          title={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={props.localToggleMute}
        >
          {muted ? (
            <IconVolumeOff aria-hidden="true" />
          ) : (
            <IconVolume aria-hidden="true" />
          )}
        </button>
        <div className={styles.inlineVolume}>{volumeControl}</div>
        <div
          className={styles.time}
          aria-label={durationLabel
            ? t("controls.timeOf", { time: currentLabel || t("controls.notAvailable"), duration: durationLabel })
            : t("controls.timeOnly", { time: currentLabel || t("controls.notAvailable") })}
        >
          <span>{currentLabel || "00:00"}</span>
          {!isLiveStream && durationLabel && (
            <span className={styles.duration}> / {durationLabel}</span>
          )}
          {isLiveStream && <span className={styles.live}>{t("controls.live")}</span>}
        </div>
        <button
          type="button"
          className={`${styles.action} ${styles.sync} ${isBehind ? styles.behind : ""}`}
          aria-label={
            isLiveStream && props.roomControls ? t("controls.syncLive") : t("controls.syncRoom")
          }
          title={isBehind ? t("controls.catchUp") : t("controls.syncRoom")}
          disabled={isLiveStream && !hasFiniteDuration}
          onClick={() =>
            isLiveStream && props.roomControls ? props.roomSeek(duration) : props.localSeek()
          }
        >
          {isBehind || !hasSyncReference ? (
            <IconRefresh aria-hidden="true" />
          ) : (
            <IconCheck aria-hidden="true" />
          )}
          <span>{isBehind || !hasSyncReference ? t("controls.sync") : t("controls.inSync")}</span>
        </button>
        {props.localPictureInPicture && !props.isYouTube &&
          typeof document !== "undefined" && document.pictureInPictureEnabled && (
          <button
            type="button"
            className={styles.action}
            aria-label={t("controls.pictureInPicture")}
            title={t("controls.pictureInPicture")}
            onClick={props.localPictureInPicture}
            data-testid="pip-button"
          >
            <IconPictureInPicture aria-hidden="true" />
          </button>
        )}
        <Popover
          opened={settingsOpened}
          onChange={setSettingsOpened}
          width={278}
          position="top-end"
          withinPortal={false}
          trapFocus
          returnFocus
          shadow="md"
        >
          <Popover.Target>
            <button
              type="button"
              className={`${styles.action} ${settingsOpened ? styles.active : ""}`}
              aria-label={t("controls.playbackSettings")}
              title={t("controls.playbackSettings")}
              aria-expanded={settingsOpened}
              onClick={() => setSettingsOpened((opened) => !opened)}
            >
              <IconSettings aria-hidden="true" />
            </button>
          </Popover.Target>
          <Popover.Dropdown className={styles.settings}>
            <div className={styles.settingsTitle}>{t("controls.playbackSettings")}</div>
            {props.roomControls && <label className={styles.settingRow}>
              <span>{t("controls.playbackSpeed")}</span>
              <select
                className={styles.select}
                value={props.roomPlaybackRate}
                disabled={disabled}
                onChange={(event) =>
                  props.roomSetPlaybackRate(Number(event.currentTarget.value))
                }
              >
                {[0, 0.25, 0.5, 1, 1.5, 2, 3].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate === 0 ? t("controls.auto") : `${rate}×`}
                  </option>
                ))}
              </select>
            </label>}
            <div className={styles.settingRow}>
              <span>{t("controls.currentSpeed")}</span>
              <span className={styles.settingValue}>
                {props.playbackRate?.toFixed(2)}×
              </span>
            </div>
            <div className={`${styles.settingRow} ${styles.mobileVolume}`}>
              <span>{t("controls.volume")}</span>
              <div className={styles.settingsVolume}>{volumeControl}</div>
            </div>
            {props.roomControls && <button
              type="button"
              className={`${styles.settingButton} ${props.loop ? styles.active : ""}`}
              aria-pressed={props.loop}
              disabled={disabled}
              onClick={() => props.roomSetLoop(!props.loop)}
            >
              <IconRepeat aria-hidden="true" /> {t("controls.loopVideo")}
              <span className={styles.settingValue}>
                {props.loop ? t("controls.on") : t("controls.off")}
              </span>
            </button>}
            {props.isYouTube ? (
              <label className={styles.settingRow}>
                <span>{t("controls.captions")}</span>
                <select
                  className={styles.select}
                  defaultValue=""
                  onChange={(event) => {
                    const language = event.currentTarget.value;
                    props.localSetSubtitleMode(
                      language === "hidden" ? "hidden" : "showing",
                      language,
                    );
                  }}
                >
                  <option value="" disabled>
                    {t("controls.chooseLanguage")}
                  </option>
                  <option value="hidden">{t("controls.off")}</option>
                  <option value="en">{t("controls.english")}</option>
                  <option value="es">{t("controls.spanish")}</option>
                </select>
              </label>
            ) : props.roomControls ? (
              <button
                type="button"
                className={`${styles.settingButton} ${subtitled ? styles.active : ""}`}
                onClick={() => {
                  setSettingsOpened(false);
                  props.localSubtitleModal();
                }}
              >
                <IconBadgeCc aria-hidden="true" /> {t("controls.captions")}
                <span className={styles.settingValue}>
                  {subtitled ? t("controls.on") : t("controls.off")}
                </span>
              </button>
            ) : null}
            {props.audioTracks && props.audioTracks.length > 1 && (
              // Audio selection is local, so the room lock must not disable it.
              <label className={styles.audioSetting}>
                <span>
                  <IconHeadphones aria-hidden="true" /> {t("controls.audioTrack")}
                </span>
                <select
                  className={styles.select}
                  value={props.audioTrackId}
                  disabled={!props.localSetAudioTrack}
                  onChange={(event) =>
                    props.localSetAudioTrack?.(
                      Number(event.currentTarget.value),
                    )
                  }
                >
                  {props.audioTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {props.roomControls && props.playlist.length > 0 && (
              <button
                type="button"
                className={styles.settingButton}
                disabled={disabled}
                onClick={() => {
                  setSettingsOpened(false);
                  props.roomPlaylistPlay(0);
                }}
              >
                <IconPlayerSkipForwardFilled aria-hidden="true" /> {t("controls.playNext")}
              </button>
            )}
            {props.onToggleComments && (
              <button
                type="button"
                className={`${styles.settingButton} ${props.commentsEnabled ? styles.active : ""}`}
                aria-pressed={Boolean(props.commentsEnabled)}
                onClick={props.onToggleComments}
              >
                <IconMessageCircle aria-hidden="true" /> {t("controls.liveComments")}
                <span className={styles.settingValue}>
                  {props.commentsEnabled ? t("controls.on") : t("controls.off")}
                </span>
              </button>
            )}
            <button
              type="button"
              className={styles.settingButton}
              onClick={() => {
                setSettingsOpened(false);
                props.localFullScreen(false);
              }}
            >
              <IconTheater aria-hidden="true" /> {t("controls.theaterMode")}
            </button>
          </Popover.Dropdown>
        </Popover>
        <button
          type="button"
          className={styles.action}
          aria-label={t("controls.toggleFullscreen")}
          title={t("controls.fullscreen")}
          onClick={() => props.localFullScreen(true)}
        >
          <IconMaximize aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
