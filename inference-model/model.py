import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import json
from typing import List
import re

POS_RE = re.compile(r"POS_(\d+)")
SUBD_RE = re.compile(r"SUBD_(\d+)")

def build_token_metadata_buffers(token_to_id):
    V = len(token_to_id)

    token_type_ids = torch.zeros(V, dtype=torch.long)
    is_hit = torch.zeros(V, dtype=torch.bool)
    is_pos = torch.zeros(V, dtype=torch.bool)
    is_sob = torch.zeros(V, dtype=torch.bool)
    pos_value = torch.zeros(V, dtype=torch.long)

    max_pos = 0
    n_types = 4

    for tok, idx in token_to_id.items():

        if tok == "<SOB>":
            is_sob[idx] = True
            token_type_ids[idx] = 0

        elif tok.startswith("HIT"):
            is_hit[idx] = True
            token_type_ids[idx] = 1

        else:
            m = POS_RE.match(tok)
            if m:
                val = int(m.group(1))
                is_pos[idx] = True
                pos_value[idx] = val
                max_pos = max(max_pos, val)
                token_type_ids[idx] = 2
            else:
                token_type_ids[idx] = 3

    return {
        "token_type_ids": token_type_ids,
        "is_hit": is_hit,
        "is_pos": is_pos,
        "is_sob": is_sob,
        "pos_value": pos_value,
        "max_beat_positions": max_pos + 1,
        "n_types": n_types,
    }


def _normalize_vocab(vocab: List[str]):
    return {tok: i for i, tok in enumerate(vocab)}

def build_sinusoidal_table(n_positions: int, dim: int) -> torch.Tensor:
    position = torch.arange(n_positions).unsqueeze(1)
    div_term = torch.exp(torch.arange(0, dim, 2) * (-math.log(10000.0) / dim))
    pe = torch.zeros(n_positions, dim)
    pe[:, 0::2] = torch.sin(position * div_term)
    pe[:, 1::2] = torch.cos(position * div_term)
    return pe
    
def make_activation(name: str) -> nn.Module:
    name = name.lower().strip()

    if name in ("gelu",):
        return nn.GELU()
    if name in ("relu",):
        return nn.ReLU()
    if name in ("silu", "swish"):
        return nn.SiLU()
    if name in ("tanh",):
        return nn.Tanh()
    if name in ("leaky_relu", "lrelu"):
        return nn.LeakyReLU(negative_slope=0.1)

    raise ValueError(f"Unknown activation: {name}")

class Transformer_Block(nn.Module):
    def __init__(
        self,
        number_embeddings: int,
        number_heads: int,
        mlp_ratio: int,
        dropout: float,
        activation_name: str = "gelu",
    ):
        super().__init__()
        self.layer_norm_1 = nn.LayerNorm(number_embeddings)
        self.attention_layer = nn.MultiheadAttention(
            embed_dim=number_embeddings,
            num_heads=number_heads,
            dropout=dropout,
            batch_first=True,
        )
        self.layer_norm_2 = nn.LayerNorm(number_embeddings)

        hidden = mlp_ratio * number_embeddings
        self.multi_layer_perceptron = nn.Sequential(
            nn.Linear(number_embeddings, hidden),
            make_activation(activation_name),
            nn.Linear(hidden, number_embeddings),
            nn.Dropout(dropout),
        )
        self.dropout = nn.Dropout(dropout)

    def forward(self, x: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        pre_attention = self.layer_norm_1(x)
        attn_out, _ = self.attention_layer(
            pre_attention,
            pre_attention,
            pre_attention,
            attn_mask=attention_mask,
            need_weights=False,
        )
        x = x + self.dropout(attn_out)

        pre_mlp = self.layer_norm_2(x)
        x = x + self.multi_layer_perceptron(pre_mlp)
        return x

class GPT(nn.Module):
    def __init__(
        self,
        vocab: List[str],
        context_size: int,
        number_of_layers: int,
        number_of_heads: int,
        number_of_embeddings: int,
        mlp_ratio: int,
        dropout: float,
        tie_weights: bool = True,
        use_type_embeddings: bool = True,
        activation_name: str = "gelu",
    ):
        super().__init__()

        token_to_id = _normalize_vocab(vocab)
        self.vocab_size = len(token_to_id)
        self.context_size = context_size
        self.use_type_embeddings = use_type_embeddings

        meta = build_token_metadata_buffers(token_to_id)
        self.n_types = meta["n_types"]
        self.max_beat_positions = meta["max_beat_positions"]

        self.register_buffer("token_type_ids", meta["token_type_ids"], persistent=True)  # [V]
        self.register_buffer("is_hit_vocab", meta["is_hit"], persistent=True)           # [V]
        self.register_buffer("is_pos_vocab", meta["is_pos"], persistent=True)           # [V]
        self.register_buffer("is_sob_vocab", meta["is_sob"], persistent=True)           # [V]
        self.register_buffer("pos_value_vocab", meta["pos_value"], persistent=True)     # [V]

        self.token_embeddings = nn.Embedding(self.vocab_size, number_of_embeddings)

        if self.use_type_embeddings:
            self.type_embeddings = nn.Embedding(self.n_types, number_of_embeddings)
        else:
            self.type_embeddings = None

        self.beat_positional_embeddings = nn.Embedding(self.max_beat_positions, number_of_embeddings)

        fixed_pe = build_sinusoidal_table(context_size, number_of_embeddings)
        self.register_buffer("fixed_sinusoidal_pe", fixed_pe, persistent=True)

        self.dropout = nn.Dropout(dropout)

        self.blocks = nn.ModuleList(
            [
                Transformer_Block(
                    number_embeddings=number_of_embeddings,
                    number_heads=number_of_heads,
                    mlp_ratio=mlp_ratio,
                    dropout=dropout,
                    activation_name=activation_name,
                )
                for _ in range(number_of_layers)
            ]
        )

        self.layer_normalization = nn.LayerNorm(number_of_embeddings)
        self.head = nn.Linear(number_of_embeddings, self.vocab_size, bias=False)
        if tie_weights:
            self.head.weight = self.token_embeddings.weight

        mask = torch.triu(torch.ones(context_size, context_size, dtype=torch.bool), diagonal=1)
        self.register_buffer("causal_mask", mask, persistent=False)

    def _compute_beat_pos_ids(self, batch_of_token_ids: torch.Tensor) -> torch.Tensor:
        """
        Beat-local pos tracker:
          - reset cur=0 when token == <SOB>
          - update cur=k when token == POS_k
        Returns beat_pos_ids [B,T]
        """
        B, T = batch_of_token_ids.shape
        device = batch_of_token_ids.device

        is_sob = self.is_sob_vocab[batch_of_token_ids]     # [B,T]
        is_pos = self.is_pos_vocab[batch_of_token_ids]     # [B,T]
        pos_val = self.pos_value_vocab[batch_of_token_ids] # [B,T]

        beat_pos_ids = torch.zeros((B, T), dtype=torch.long, device=device)
        cur = torch.zeros((B,), dtype=torch.long, device=device)

        for t in range(T):
            cur = torch.where(is_sob[:, t], torch.zeros_like(cur), cur)
            cur = torch.where(is_pos[:, t], pos_val[:, t].clamp(min=0), cur)
            beat_pos_ids[:, t] = cur

        if self.max_beat_positions > 1:
            beat_pos_ids = beat_pos_ids.clamp(min=0, max=self.max_beat_positions - 1)
        else:
            beat_pos_ids = torch.zeros_like(beat_pos_ids)

        return beat_pos_ids

    def forward(self, batch_of_token_ids: torch.Tensor) -> torch.Tensor:
        B, T = batch_of_token_ids.shape
        if T > self.context_size:
            raise ValueError(f"Sequence length {T} > context_size {self.context_size}")

        tok_emb = self.token_embeddings(batch_of_token_ids)  # [B,T,d]

        if self.use_type_embeddings:
            type_ids = self.token_type_ids[batch_of_token_ids]  # [B,T]
            type_emb = self.type_embeddings(type_ids)           # [B,T,d]
        else:
            type_emb = 0.0

        is_hit = self.is_hit_vocab[batch_of_token_ids]  # [B,T]

        beat_pos_ids = self._compute_beat_pos_ids(batch_of_token_ids)  # [B,T]
        beat_pos_emb = self.beat_positional_embeddings(beat_pos_ids)   # [B,T,d]

        fixed_pe = self.fixed_sinusoidal_pe[:T].unsqueeze(0).expand(B, T, -1)  # [B,T,d]

        pos_add = torch.where(is_hit.unsqueeze(-1), beat_pos_emb, fixed_pe)

        x = tok_emb + type_emb + pos_add
        x = self.dropout(x)

        attention_mask = self.causal_mask[:T, :T]
        for block in self.blocks:
            x = block(x, attention_mask=attention_mask)

        x = self.layer_normalization(x)
        logits = self.head(x)
        return logits

def load_model(ckpt_path, device="cpu"):
    ckpt = torch.load(ckpt_path, map_location=device)

    vocab = ckpt["vocab"]
    context_size = ckpt["context_size"]
    use_type_embeddings = ckpt.get("use_type_embeddings", True)

    model = GPT(
        vocab=vocab,
        context_size=context_size,
        number_of_layers=10,
        number_of_heads=8,
        number_of_embeddings=512,
        mlp_ratio=4,
        dropout=0.0,
        tie_weights=True,
        use_type_embeddings=use_type_embeddings,
        activation_name="gelu",
    ).to(device)

    model.load_state_dict(ckpt["model_state"])
    model.eval()

    token_to_id = {t:i for i,t in enumerate(vocab)}
    id_to_token = vocab

    return model, token_to_id, id_to_token

@torch.no_grad()
def generate(model, token_to_id, id_to_token, prompt, max_new_tokens=200, temperature=1.0, top_k=5):
    device = next(model.parameters()).device

    ids = torch.tensor([token_to_id[t] for t in prompt], dtype=torch.long, device=device)[None, :]

    for _ in range(max_new_tokens):
        x = ids[:, -model.context_size:]
        logits = model(x)[:, -1, :] / temperature

        if top_k is not None:
            # Keep only the top_k logits
            topk_vals, topk_indices = torch.topk(logits, top_k, dim=-1)
            probs = torch.zeros_like(logits).scatter_(-1, topk_indices, torch.softmax(topk_vals, dim=-1))
        else:
            probs = torch.softmax(logits, dim=-1)

        next_id = torch.multinomial(probs, num_samples=1)
        ids = torch.cat([ids, next_id], dim=1)

    return [id_to_token[i] for i in ids[0].tolist()]