"""
Embedding server for Mizuchi.

Loads jina-embeddings-v2-base-code and processes batches of text from stdin,
writing embeddings to stdout as JSON lines.

Protocol (newline-delimited JSON):
  -> {"type":"batch","texts":["text1","text2",...]}
  <- {"type":"result","embeddings":[[0.1,0.2,...],[0.3,0.4,...]]}

  -> {"type":"done"}
  <- (process exits)

Startup:
  <- {"type":"ready","dimension":768,"device":"mps"}

All log/debug output goes to stderr.
"""
import json
import sys

import torch
from transformers import AutoModel, AutoTokenizer


def get_device():
    """Select the best available device: MPS (Apple Silicon) > CUDA > CPU."""
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def mean_pooling(model_output, attention_mask):
    """Mean pooling over token embeddings, respecting the attention mask."""
    token_embeddings = model_output[0]
    input_mask_expanded = (
        attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
    )
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(
        input_mask_expanded.sum(1), min=1e-9
    )


def main():
    model_name = "jinaai/jina-embeddings-v2-base-code"

    print(f"Loading model {model_name}...", file=sys.stderr)

    device = get_device()
    print(f"Using device: {device}", file=sys.stderr)

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    model = AutoModel.from_pretrained(model_name, trust_remote_code=True)
    model = model.to(device)
    model.eval()

    dimension = model.config.hidden_size

    # Signal ready
    ready_msg = json.dumps(
        {"type": "ready", "dimension": dimension, "device": str(device)}
    )
    sys.stdout.write(ready_msg + "\n")
    sys.stdout.flush()

    print(f"Ready. Dimension={dimension}, device={device}", file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON: {e}", file=sys.stderr)
            continue

        msg_type = msg.get("type")

        if msg_type == "done":
            print("Received done signal, exiting.", file=sys.stderr)
            break

        if msg_type == "batch":
            texts = msg.get("texts", [])
            if not texts:
                result = json.dumps({"type": "result", "embeddings": []})
                sys.stdout.write(result + "\n")
                sys.stdout.flush()
                continue

            try:
                encoded = tokenizer(
                    texts,
                    padding=True,
                    truncation=True,
                    max_length=2048,
                    return_tensors="pt",
                )
                encoded = {k: v.to(device) for k, v in encoded.items()}

                with torch.no_grad():
                    output = model(**encoded)

                embeddings = mean_pooling(output, encoded["attention_mask"])
                embeddings = torch.nn.functional.normalize(embeddings, p=2, dim=1)

                embeddings_list = embeddings.cpu().tolist()

                result = json.dumps({"type": "result", "embeddings": embeddings_list})
                sys.stdout.write(result + "\n")
                sys.stdout.flush()

                print(
                    f"Embedded batch of {len(texts)} texts.", file=sys.stderr
                )

            except Exception as e:
                error_msg = json.dumps({"type": "error", "message": str(e)})
                sys.stdout.write(error_msg + "\n")
                sys.stdout.flush()
                print(f"Error embedding batch: {e}", file=sys.stderr)
        else:
            print(f"Unknown message type: {msg_type}", file=sys.stderr)


if __name__ == "__main__":
    main()
