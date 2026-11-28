# Submission demo game

Import [the completed game](chesscue-demo.pgn) with the learner's side selected to exercise the same analysis pipeline as a player's PGN. The package generator selected this historical game for the attacking study course. Its moves and attribution are preserved from the source archive. The generated material records the source hash and checked positions.

## Rook feedback proof of concept

Run `pnpm dev` and open `/demo/rook.html` on the Vite server. Enable **Hands-free voice** before making a move. After Rook asks a question aloud, speak when the input meter appears. The meter shows the microphone level before speech recognition. Chrome sends the final transcript to Rook automatically. You can also use **Speak**, type an answer, or choose **Try their reply** and play the opponent move you expected. Chrome may require microphone permission and an offline speech pack. Use a Chrome profile with Gemini Nano already downloaded to see the **Gemini Nano on device** source.

1. Move the white queen from f4 to d2. Give your reason and select **Show replay**. After the replay, **Queen safety** is complete.
2. Select **Try another move** and play the queen from f4 to b4. The retry appears in Practice as soon as Stockfish verifies the mistake. Give your reason and reveal the reply, or select **Give me a hint** first. Select the new Practice item to return to the position.

Stockfish evaluates each move and supplies the continuation. The starting position and Queen safety goal are the demo inputs. To try a different board, pass a URL-encoded FEN as the `fen` query parameter. Practice changes last for the current page session.

Use **Compare** to see Stockfish’s estimates for both moves after equal search time, along with legal checks and the checked continuations. **Ask Rook** and **Keep playing** leave the transcript open.
