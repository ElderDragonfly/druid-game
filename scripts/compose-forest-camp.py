"""Original menu-music sketch. Produces MIDI + an offline SoundFont preview.

No game/runtime dependency: Python, NumPy, SciPy, libfluidsynth, FFmpeg and a
local General MIDI SoundFont are used only while preparing the audio files.
"""
import argparse
import ctypes as C
import ctypes.util
from pathlib import Path
import struct
import subprocess
import tempfile
import wave

import numpy as np
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs/audio/forest-camp-v1'
RATE, BPM, BEATS_PER_BAR, BARS = 44100, 64, 3, 16
SECONDS_PER_BEAT = 60 / BPM
LENGTH_BEATS = BEATS_PER_BAR * BARS
LOOP_FRAMES = round(LENGTH_BEATS * SECONDS_PER_BEAT * RATE)
PROGRAMS = [24, 73, 49, 42, 8]  # nylon guitar, flute, slow strings, cello, celesta
PANS = [42, 72, 80, 54, 90]


def composition():
    """(Beat, duration, channel, MIDI pitch, velocity), before sample rendering."""
    notes = []

    def note(bar, beat, duration, channel, pitch, velocity):
        notes.append((bar * BEATS_PER_BAR + beat, duration, channel, pitch, velocity))

    # Two bars each: Dm(add9), Bbmaj7, Fmaj7, Cadd9, Gm(add9), Dm/F,
    # Bbmaj7, then an open A suspension. No dominant third or hard cadence.
    harmony = [
        (38, [53, 57, 62, 64]), (34, [53, 57, 62, 65]),
        (41, [53, 57, 60, 64]), (36, [55, 60, 62, 64]),
        (43, [50, 53, 58, 69]), (41, [53, 57, 62, 64]),
        (34, [53, 57, 62, 65]), (33, [55, 57, 62, 64]),
    ]
    for bar in range(BARS):
        root, chord = harmony[bar // 2]
        for index, pitch in enumerate(chord):
            note(bar, .025 + index * .009, 2.90, 2, pitch, 23 + (index % 2))
        if bar % 2 == 0:
            note(bar, .015, 5.82, 3, root, 31)
        pattern = [0, 2, 1, 3, 2, 1] if bar % 2 == 0 else [0, 1, 2, 3, 1, 2]
        for step, index in enumerate(pattern):
            # A few millisecond offsets and gentle accents, never a percussion beat.
            offset = [0.027, 0.019, 0.033, 0.023, 0.036, 0.021][step]
            note(bar, step * .5 + offset, 1.05, 0, chord[index],
                 [46, 37, 40, 43, 35, 38][step] + (bar % 3 - 1))

    melody = [
        [(1, .74, 69), (2, .57, 67)],
        [(0, 1.24, 65), (1.5, .42, 64), (2, .76, 62)],
        [(.5, .84, 65), (1.5, 1.05, 69)],
        [(0, 1.45, 67), (2, .70, 65)],
        [(.5, .85, 69), (1.5, .85, 72)],
        [(0, .82, 69), (1, .62, 67), (2, .76, 64)],
        [(.5, .82, 67), (1.5, .84, 74)],
        [(0, 1.40, 72), (2, .70, 69)],
        [(.5, .83, 70), (1.5, .95, 69)],
        [(0, 1.38, 67), (2, .72, 62)],
        [(.5, .84, 65), (1.5, .90, 69)],
        [(0, 1.42, 64), (2, .72, 62)],
        [(0, 1.20, 65), (1.5, .90, 69)],
        [(.5, .80, 72), (1.5, .52, 70), (2.25, .57, 69)],
        [(0, 1.38, 67), (2, .72, 64)],
        [(0, 1.45, 64)],
    ]
    for bar, phrase in enumerate(melody):
        for index, (beat, duration, pitch) in enumerate(phrase):
            note(bar, beat + .045, duration, 1, pitch, 47 + (bar + index) % 4)
    for bar, pitch in [(3, 81), (7, 86), (11, 81), (15, 88)]:
        note(bar, 2.42, .32, 4, pitch, 27)
    return sorted(notes)


def variable_length(value):
    data = [value & 127]
    while value > 127:
        value >>= 7
        data.insert(0, (value & 127) | 128)
    return bytes(data)


def write_midi(notes, path):
    ticks = 480
    events = [(0, -3, b'\xff\x51\x03' + round(60_000_000 / BPM).to_bytes(3, 'big')),
              (0, -2, b'\xff\x58\x04\x06\x03\x24\x08'),
              (0, -1, b'\xff\x59\x02\xff\x01')]
    for channel, program in enumerate(PROGRAMS):
        events.extend([(0, -1, bytes([0xC0 | channel, program])),
                       (0, -1, bytes([0xB0 | channel, 10, PANS[channel]]))])
    for beat, duration, channel, pitch, velocity in notes:
        events.extend([(round(beat * ticks), 1, bytes([0x90 | channel, pitch, velocity])),
                       (round(min(beat + duration, LENGTH_BEATS) * ticks), 0, bytes([0x80 | channel, pitch, 0]))])
    events.append((LENGTH_BEATS * ticks, 2, b'\xff\x2f\x00'))
    track, previous = bytearray(), 0
    for tick, _, message in sorted(events):
        track.extend(variable_length(tick - previous) + message)
        previous = tick
    path.write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, ticks) +
                     b'MTrk' + struct.pack('>I', len(track)) + track)


def render(notes, soundfont):
    library = ctypes.util.find_library('fluidsynth')
    if not library:
        raise RuntimeError('Offline rendering requires libfluidsynth.')
    fluid = C.CDLL(library)

    def bind(name, result, *arguments):
        function = getattr(fluid, name)
        function.restype, function.argtypes = result, arguments
        return function

    ptr, integer, double, string = C.c_void_p, C.c_int, C.c_double, C.c_char_p
    settings = bind('new_fluid_settings', ptr)()
    bind('fluid_settings_setnum', integer, ptr, string, double)(settings, b'synth.sample-rate', RATE)
    bind('fluid_settings_setnum', integer, ptr, string, double)(settings, b'synth.gain', .65)
    synth = bind('new_fluid_synth', ptr, ptr)(settings)
    try:
        loaded = bind('fluid_synth_sfload', integer, ptr, string, integer)(synth, str(soundfont).encode(), 1)
        if loaded < 0:
            raise RuntimeError(f'Cannot load SoundFont: {soundfont}')
        bind('fluid_synth_set_chorus_on', integer, ptr, integer, integer)(synth, -1, 0)
        bind('fluid_synth_set_reverb', None, ptr, double, double, double, double)(synth, .70, .48, 65, .28)
        program = bind('fluid_synth_program_change', integer, ptr, integer, integer)
        control = bind('fluid_synth_cc', integer, ptr, integer, integer, integer)
        on = bind('fluid_synth_noteon', integer, ptr, integer, integer, integer)
        off = bind('fluid_synth_noteoff', integer, ptr, integer, integer)
        write = bind('fluid_synth_write_float', integer, ptr, integer, ptr, integer, integer, ptr, integer, integer)
        for channel, instrument in enumerate(PROGRAMS):
            program(synth, channel, instrument)
            control(synth, channel, 10, PANS[channel])
        events = []
        # Warm up two complete repeats, including the preceding notes' reverb.
        # The third cycle is the deliverable, so it has no artificial fade-in/out.
        for repeat in range(3):
            for beat, duration, channel, pitch, velocity in notes:
                start = round((repeat * LENGTH_BEATS + beat) * SECONDS_PER_BEAT * RATE)
                end = round((repeat * LENGTH_BEATS + beat + duration) * SECONDS_PER_BEAT * RATE)
                events.extend([(start, 1, channel, pitch, velocity), (end, 0, channel, pitch, 0)])
        output = np.zeros((LOOP_FRAMES * 3, 2), dtype=np.float32)
        cursor = 0

        def until(frame):
            nonlocal cursor
            frame = min(frame, len(output))
            while cursor < frame:
                count = min(frame - cursor, 4096)
                data = output[cursor:cursor + count]
                if write(synth, count, data.ctypes.data, 0, 2, data.ctypes.data, 1, 2) != 0:
                    raise RuntimeError('SoundFont rendering failed')
                cursor += count

        for frame, kind, channel, pitch, velocity in sorted(events):
            until(frame)
            if kind:
                on(synth, channel, pitch, velocity)
            else:
                off(synth, channel, pitch)
        until(len(output))
        # Very low rumble removed before extracting the settled cycle.
        output = sosfilt(butter(2, 32, 'highpass', fs=RATE, output='sos'), output, axis=0)
        loop = output[2 * LOOP_FRAMES:3 * LOOP_FRAMES].copy()
        peak = float(np.max(np.abs(loop)))
        if not np.isfinite(peak) or peak <= 0:
            raise RuntimeError('Empty or invalid audio')
        loop *= .46 / peak
        # Ease the final 8 ms into the starting sample without fading to silence.
        # This removes tiny sample-phase/DC differences at the circular seam.
        count = round(.008 * RATE)
        correction = loop[0] - loop[-1]
        loop[-count:] += np.linspace(0, 1, count)[:, None] ** 2 * correction
        return loop
    finally:
        bind('delete_fluid_synth', None, ptr)(synth)
        bind('delete_fluid_settings', None, ptr)(settings)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--soundfont', type=Path, default=Path('/usr/share/sounds/sf2/TimGM6mb.sf2'))
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    notes = composition()
    write_midi(notes, OUTPUT / 'forest-camp.mid')
    audio = render(notes, args.soundfont)
    assert audio.shape == (LOOP_FRAMES, 2) and np.isfinite(audio).all()
    assert np.max(np.abs(audio)) < .50
    assert np.max(np.abs(audio[-1] - audio[0])) < 1e-7
    with tempfile.TemporaryDirectory(prefix='forest-camp-') as directory:
        wav = Path(directory) / 'forest-camp.wav'
        with wave.open(str(wav), 'wb') as file:
            file.setnchannels(2)
            file.setsampwidth(2)
            file.setframerate(RATE)
            file.writeframes(np.round(audio * 32767).astype('<i2').tobytes())
        for extension, codec in [('mp3', ['-c:a', 'libmp3lame', '-b:a', '160k']),
                                 ('ogg', ['-c:a', 'libvorbis', '-q:a', '5'])]:
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                            *codec, '-metadata', 'title=Forest Camp - sketch 01',
                            str(OUTPUT / f'forest-camp-loop.{extension}')], check=True)
    print(f'{BARS} bars, 6/8, quarter={BPM}, {len(audio)/RATE:.3f} seconds, {len(notes)} notes.')
    print(f'Peak {20*np.log10(np.max(np.abs(audio))):.2f} dBFS; seamless PCM boundary; no runtime changes.')


if __name__ == '__main__':
    main()
