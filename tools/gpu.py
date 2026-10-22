"""Use the local GPU where there is one: NVENC for encoding video, and GPU drawing in the headless browser.

Falls back to the CPU encoder (libx264) when ffmpeg has no NVENC.
"""
import functools
import subprocess


@functools.cache
def nvenc():
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        if "h264_nvenc" not in out:
            return False
        # an encoder can be listed without a card to run it on: try one frame
        test = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.04",
                               "-c:v", "h264_nvenc", "-f", "null", "-"], capture_output=True)
        return test.returncode == 0
    except OSError:
        return False


def video(quality=18):
    """Encoder arguments for a high-quality H.264 master; `quality` is on the x264 CRF scale."""
    if nvenc():
        return ["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", str(quality + 1), "-b:v", "0",
                "-spatial-aq", "1", "-pix_fmt", "yuv420p"]
    return ["-c:v", "libx264", "-preset", "slow", "-crf", str(quality), "-pix_fmt", "yuv420p"]


def instagram():
    """What Instagram takes best for a Reel: H.264 High, a key frame every 2 s at 30 fps, about 8 Mbit/s at most
    (higher only makes it squeeze harder), BT.709 colour."""
    common = ["-profile:v", "high", "-level", "4.1", "-maxrate", "8M", "-bufsize", "16M", "-g", "60",
              "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
              "-r", "30"]
    if nvenc():
        return ["-c:v", "h264_nvenc", "-preset", "p6", "-tune", "hq", "-rc", "vbr", "-cq", "20", "-b:v", "6M",
                "-spatial-aq", "1", "-bf", "2", *common]
    return ["-c:v", "libx264", "-preset", "slow", "-crf", "19", "-keyint_min", "60", "-sc_threshold", "0", *common]


# for chromium.launch(): draw on the GPU even when headless
BROWSER_ARGS = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=d3d11", "--enable-zero-copy"]
