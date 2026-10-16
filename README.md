# ComfyUI-Anima3DPoseControl

Anima base(28블록)와 Anima 2.9B(40블록)에서 모델, LoRA, 3D 포즈를 같은 방식으로 쓰기 위한 ComfyUI 커스텀 노드입니다.

폴더 이름은 `ComfyUI-Anima3DPoseControl`입니다. 워크플로가 저장하는 노드 클래스 이름은 바꾸지 않았습니다. 다른 PC의 기존 워크플로도 아래 클래스 이름 그대로 찾습니다.

## 들어 있는 노드

| 화면 이름 | 클래스 이름 | 하는 일 |
|---|---|---|
| Anima 모델 로더 | `AnimaModelLoader` | UNET, CLIP, VAE를 불러오고 Easy Use Anima의 `LORA_STACK`을 적용합니다. 28블록 LoRA는 2.9B의 원래 블록 위치로 옮겨 붙입니다. 블록 번호가 이미 2.9B용인 LoRA는 그대로 적용합니다. |
| Anima LoRA 프롬프트 | `AnimaLoraPrompt` | 스타일 문장, 켜진 T+ 트리거, 직접 입력한 문장을 이어 긍정 프롬프트를 만듭니다. 노드 아래 `적용될 프롬프트`에 합쳐진 문장이 보입니다. |
| 리전 기본 프롬프트 | `AnimaRegionBase` | 그 문장을 리전 페인터의 Base 칸 대신 공통 문장으로 넣습니다. 칠한 레이어에는 부위 태그가 따로 필요합니다. |
| Anima 포즈 적용 | `AnimaPoseApply` | `ModelPatchLoader`의 3D 포즈 패치와 포즈 이미지를 모델에 적용합니다. 28블록용 패치는 2.9B에서 새로 끼워진 블록을 건너뛰고, 베이스와 같은 층에만 들어갑니다. |
| 구도 설정 | `AnimaCameraPanel` | 궤도 슬라이더로 `from_left`, `from_right`, `from_behind` 같은 시점 문장을 만듭니다. 3D 포즈 에디터의 카메라와는 별개입니다. |

`Anima LoRA 프롬프트`의 T+는 왼쪽 토글이 켜진 LoRA에만 태그를 붙입니다. 작가 가중치 `(@artist:0.35)`는 문장 그대로 유지됩니다.

## 다른 PC에서 이 PC와 같이 쓰려면

1. 이 저장소를 `ComfyUI/custom_nodes/ComfyUI-Anima3DPoseControl`에 클론합니다. 예전에 `ComfyUI-AnimaSeedLoader`라는 폴더가 있으면 지우고 이 폴더만 둡니다. 둘 다 있으면 같은 노드가 두 번 등록됩니다.
2. ComfyUI를 다시 시작합니다. 이 PC는 ComfyUI 0.40.0입니다. `Anima 포즈 적용`은 본체에 있는 Anima LLLite(`AnimaLLLiteApply`)를 사용합니다.
3. 모델 파일을 같은 종류의 폴더에 넣습니다. 파일 이름은 워크플로에 저장된 것과 같아야 합니다.

이 PC의 로더가 읽는 파일은 다음과 같습니다.

- UNET: `models/unet/Anima/` 아래의 base 또는 2.9B. 예: `anima_baseV10.safetensors`, `silvermoonmixAnimaEvolved_v2329B_bf16.safetensors`
- CLIP: `models/text_encoders/qwen_3_06b_base.safetensors`
- VAE: `models/vae/qwen_image_vae.safetensors`
- 3D 포즈 패치: `models/model_patches/anima_3dpose_6200.safetensors`
- LoRA: `models/loras/` 아래, 프리셋에 적힌 경로 그대로

현재 워크플로는 이 패키지 밖에 있는 노드도 사용합니다. 같은 그래프를 열려면 다음 커스텀 노드가 필요합니다.

- [ComfyUI-EasyUseAnima](https://github.com/n0va39/ComfyUI-EasyUseAnima) — `Anima LoRA Preset`. 트리거 미리보기도 이 패키지의 LoRA 메타데이터를 읽습니다.
- [ComfyUI_toyxyz_test_nodes](https://github.com/toyxyz/ComfyUI_toyxyz_test_nodes) — 3D 포즈 에디터, 리전 페인터, `ComfyCoupleMask`
- [ComfyUI-Image-Saver](https://github.com/alexopus/ComfyUI-Image-Saver) — 모델 이름과 시드가 들어가는 이미지 저장

3D 포즈 에디터는 브라우저에서 메쉬를 렌더한 뒤에 큐에 넣어야 합니다. 저장된 워크플로의 렌더 캡처가 비어 있으면 그 노드는 실행되지 않습니다.
