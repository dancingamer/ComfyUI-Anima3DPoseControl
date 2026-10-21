# ComfyUI-Anima3DPoseControl

Anima base(28블록)와 Anima 2.9B(40블록)에서 모델, LoRA, 3D 포즈를 같은 방식으로 쓰기 위한 ComfyUI 커스텀 노드입니다.

폴더 이름은 `ComfyUI-Anima3DPoseControl`입니다. 워크플로가 저장하는 노드 클래스 이름은 바꾸지 않았습니다. 다른 PC의 기존 워크플로도 아래 클래스 이름 그대로 찾습니다.

## 들어 있는 노드

| 화면 이름 | 클래스 이름 | 하는 일 |
|---|---|---|
| Anima 모델 로더 | `AnimaModelLoader` | UNET, CLIP, VAE를 불러오고 Easy Use Anima의 `LORA_STACK`을 적용합니다. 28블록 LoRA는 2.9B의 원래 블록 위치로 옮겨 붙입니다. 블록 번호가 이미 2.9B용인 LoRA는 그대로 적용합니다. |
| Anima LoRA 프롬프트 | `AnimaLoraPrompt` | 카메라 문장, 스타일 문장, 켜진 T+ 트리거, 직접 입력한 장면 문장을 이 순서로 이어 긍정 프롬프트를 만듭니다. 아래 `적용될 프롬프트`는 그 결과를 보여 주고, 노드를 키우면 위쪽 입력칸과 같이 늘어납니다. |
| 리전 기본 프롬프트 | `AnimaRegionBase` | 그 문장을 리전 페인터의 Base 칸 대신 공통 문장으로 넣습니다. 칠한 레이어에는 부위 태그가 따로 필요합니다. |
| Anima 포즈 적용 | `AnimaPoseApply` | `ModelPatchLoader`의 3D 포즈 패치와 포즈 이미지를 모델에 적용합니다. 28블록용 패치는 2.9B의 원래 블록 위치로 들어갑니다. |
| 구도 설정 | `AnimaCameraPanel` | 궤도 노브로 `from_left`, `from_right`, `from_behind` 같은 시점 문장을 만듭니다. 3D 포즈 에디터의 카메라와는 별개입니다. |
| 카메라 선택 | `AnimaCameraSource` | BSK 카메라 문장과 구도 설정 문장 중 하나를 고릅니다. |

`Anima LoRA 프롬프트`의 T+는 왼쪽 토글이 켜진 LoRA에만 태그를 붙입니다. 작가 가중치 `(@artist:0.35)`는 문장 그대로 유지됩니다.

## 카메라 문장을 장면에 붙이는 방법

장면 문장은 `Anima LoRA 프롬프트`의 입력칸에 적습니다. Positive는 이 노드의 출력을 받으므로, 실행되는 문장은 이 노드가 이어 붙인 결과입니다. 작가 태그와 T+ 트리거는 예전과 같이 Easy Use 프리셋의 `style_prompt`, `trigger_words`를 이 노드에 연결합니다. 카메라 문장은 그 소켓에 넣지 않고, 따로 있는 `camera_prompt`에만 연결합니다. 프리셋 소켓에 카메라를 꽂으면 작가 태그와 트리거를 읽지 못합니다.

`camera_prompt`를 비워 두면 예전 그래프와 같이 스타일, 트리거, 장면 문장만 이어집니다.

두 카메라를 한 장면에서 바꿔 보려면 이렇게 연결합니다.

1. BSK를 쓰려면 한국어 작업본 [ComfyUI-bsk_UI](https://github.com/dancingamer/ComfyUI-bsk_UI)의 `BSK_카메라 제어`를 설치합니다. 원본 저장소를 받으면 화면 문구와 이 PC에서 고친 불러오기 수정이 없습니다. 이 노드는 문장만 만들고 LoRA는 불러오지 않으므로, 프리셋에 `Anima/anima_bsk_camera_control.safetensors`를 모델 0.8, CLIP 0.8로 올립니다. 점을 오른쪽으로 끌면 태그는 `from left`입니다. 플러그인이 좌우 태그를 그렇게 적습니다. 이 노드는 시점 태그만 만들고, 캐릭터 위치는 그 태그를 본 모델이 다시 그립니다.
2. 구도 설정을 쓰려면 `구도 설정`의 `camera_prompt` 출력만 사용합니다. 노드 안의 추가 프롬프트 칸은 연결하지 않습니다. 오른쪽은 `from_right`이고 가중치는 1을 넘지 않습니다. 이 노드도 시점 태그만 만듭니다. 스위치를 끄면 빈 문장을 냅니다.
3. `카메라 선택`의 `bsk`와 `lakis`에 두 문장을 연결하고, source에서 `BSK` 또는 `LAKIS`를 고릅니다. 고른 출력을 `Anima LoRA 프롬프트`의 `camera_prompt`에 연결합니다. 기본값은 `BSK`입니다.
4. 노드를 큐에 넣기 전에 `적용될 프롬프트`에서 카메라 문장, 스타일 태그, 켜진 T+ 트리거, 장면 문장이 이어져 보이는지 확인합니다. 이 칸은 읽기 전용입니다. 저장되고 실행되는 장면 문장은 위쪽 입력칸의 원래 문장입니다.

같은 연결의 예시 그래프는 `workflows/AnimaPoseCameraV1.json`입니다. ComfyUI에서 이 파일을 열면 됩니다.

## 2.9B에서 포즈와 LoRA를 같이 쓸 때

LoRA가 없는 2.9B에서는 28블록용 포즈 패치가 새로 끼워진 12개 블록을 건너뜁니다. LoRA가 이미 모델에 있으면, 그 끼워진 블록은 바로 앞 원래 블록의 포즈 잔차를 반복합니다. 끼워진 블록을 비워 두면 포즈가 지워지기 때문입니다.

이때 셀프 어텐션의 `q_proj`, `k_proj`, `v_proj`, `output_proj`와 `adaln_modulation_self_attn`에 걸린 LoRA는 포즈를 적용하는 동안 빼서 베이스 가중치를 유지합니다. 다른 층의 LoRA는 그대로 둡니다. 셀프 어텐션 LoRA가 포즈 잔차의 방향을 바꾸기 때문입니다.

## 다른 PC에서 이 PC와 같이 쓰려면

1. 이 저장소를 `ComfyUI/custom_nodes/ComfyUI-Anima3DPoseControl`에 클론합니다. 
2. ComfyUI를 다시 시작합니다. 이 PC는 ComfyUI 0.40.0입니다. `Anima 포즈 적용`은 본체에 있는 Anima LLLite(`AnimaLLLiteApply`)를 사용합니다.
3. 모델 파일을 같은 종류의 폴더에 넣습니다. 파일 이름은 워크플로에 저장된 것과 같아야 합니다.

이 PC의 로더가 읽는 파일은 다음과 같습니다.

- UNET: `models/unet/Anima/` 아래의 base 또는 2.9B. 예: `anima_baseV10.safetensors`, `anima29B_v10_bf16.safetensors`
- CLIP: `models/text_encoders/qwen_3_06b_base.safetensors`
- VAE: `models/vae/qwen_image_vae.safetensors`
- 3D 포즈 패치: `models/model_patches/anima_3dpose_6200.safetensors`
- LoRA: `models/loras/` 아래, 프리셋에 적힌 경로 그대로. BSK 카메라 비교에는 `models/loras/Anima/anima_bsk_camera_control.safetensors`가 필요합니다.

현재 워크플로는 이 패키지 밖에 있는 노드도 사용합니다. 같은 그래프를 열려면 다음 커스텀 노드가 필요합니다.

- [ComfyUI-EasyUseAnima](https://github.com/n0va39/ComfyUI-EasyUseAnima) — `Anima LoRA Preset`. 트리거 미리보기도 이 패키지의 LoRA 메타데이터를 읽습니다.
- [ComfyUI-bsk_UI](https://github.com/dancingamer/ComfyUI-bsk_UI) — 한국어로 고친 `BSK_카메라 제어`. 구도 설정만 쓸 때는 없어도 됩니다.
- [ComfyUI_toyxyz_test_nodes](https://github.com/toyxyz/ComfyUI_toyxyz_test_nodes) — 3D 포즈 에디터, 리전 페인터, `ComfyCoupleMask`
- [ComfyUI-Image-Saver](https://github.com/alexopus/ComfyUI-Image-Saver) — 모델 이름과 시드가 들어가는 이미지 저장

3D 포즈 에디터는 브라우저에서 메쉬를 렌더한 뒤에 큐에 넣어야 합니다. 저장된 워크플로의 렌더 캡처가 비어 있으면 그 노드는 실행되지 않습니다.
