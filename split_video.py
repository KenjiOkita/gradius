import static_ffmpeg
import os
import subprocess

# ffmpegへのパスを通す
static_ffmpeg.add_paths()

def split_video(input_file, chapters):
    base_dir = os.path.dirname(input_file)
    
    # チャプター設定 (開始, 終了, タイトル)
    # 少しだけ開始を早め、終了を遅くして言葉の切れを防ぐ微調整(-0.3s/+0.2s)
    chapter_list = [
        ("00:00:00.000", "00:00:44.200", "努力よりも順番"),
        ("00:00:43.700", "00:01:29.200", "成果が出ない真の理由"),
        ("00:01:28.700", "00:01:54.300", "今すぐやるべき対策")
    ]
    
    for i, (start, end, title) in enumerate(chapters, 1):
        output_file = os.path.join(base_dir, f"{i}_{title}.mp4")
        
        # -c:v libx264: 高画質なH.264で再エンコード
        # -preset superfast: M4ならこれでも高品質かつ高速
        cmd = [
            'ffmpeg', '-y',
            '-ss', start,
            '-to', end,
            '-i', input_file,
            '-c:v', 'libx264',
            '-preset', 'superfast',
            '-crf', '20',
            '-c:a', 'aac',
            output_file
        ]
        
        print(f"分割中: {output_file} ({start} -> {end})")
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    
    print("\nすべての分割が完了しました！")

if __name__ == "__main__":
    input_video = "/Users/kenjiokita/Downloads/順番を変えろ.mp4"
    
    # チャプター設定 (開始, 終了, タイトル)
    chapter_list = [
        ("00:00:00", "00:00:44", "努力よりも順番"),
        ("00:00:44", "00:01:29", "成果が出ない真の理由"),
        ("00:01:29", "00:01:54", "今すぐやるべき対策")
    ]
    
    if os.path.exists(input_video):
        split_video(input_video, chapter_list)
    else:
        print(f"エラー: 元ファイルが見つかりません: {input_video}")
