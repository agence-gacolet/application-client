# Transcription d'un fichier son en français, sur le Mac (puce Apple), avec le modèle whisper-large-v3-turbo.
# Le modèle est téléchargé une seule fois (environ 1,6 Go), puis tout se fait sans internet.
import sys
import mlx_whisper

r = mlx_whisper.transcribe(sys.argv[1], path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="fr")
print(r["text"].strip())
