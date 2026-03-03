import whisper
import static_ffmpeg
import os
import sys

# ffmpegへのパスを通す
static_ffmpeg.add_paths()

def format_timestamp(seconds: float):
    td = float(seconds)
    hours = int(td // 3600)
    minutes = int((td % 3600) // 60)
    seconds = int(td % 60)
    milliseconds = int((td % 1) * 1000)
    return f"[{hours:02d}:{minutes:02d}:{seconds:02d}.{milliseconds:03d}]"

def transcribe(file_path):
    print(f"最高精度のモデル(turbo)をロード中...")
    # 'turbo' モデルを使用（最高レベルの精度と文脈理解）
    model = whisper.load_model("turbo")
    
    print(f"文字起こしを開始します: {file_path}")
    print("※初回はモデルのダウンロードに時間がかかる場合があります。")
    
    result = model.transcribe(file_path, verbose=False, language="ja")
    
    output_lines = []
    for segment in result['segments']:
        start = format_timestamp(segment['start'])
        end = format_timestamp(segment['end'])
        text = segment['text']
        line = f"{start} --> {end} {text}"
        print(line)
        output_lines.append(line)
    
    # ファイルに保存
    output_file = os.path.splitext(file_path)[0] + "_transcript.txt"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))
    
    print(f"\n完了しました！保存先: {output_file}")

if __name__ == "__main__":
    target_file = "/Users/kenjiokita/Downloads/順番を変えろ.mp4"
    if not os.path.exists(target_file):
        print(f"エラー: ファイルが見つかりません: {target_file}")
        sys.exit(1)
    
    transcribe(target_file)
