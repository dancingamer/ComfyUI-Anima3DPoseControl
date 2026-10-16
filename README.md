# ComfyUI-AnimaSeedLoader

Anima base와 Anima 2.9B를 한 로더에서 불러옵니다. Easy Use Anima의 `Anima LoRA Preset`이 내보내는 `LORA_STACK`을 연결하면, 28블록 LoRA는 2.9B의 해당 블록 위치로 옮겨 적용합니다.

`Anima LoRA 프롬프트`는 프리셋의 스타일 문장과, 왼쪽 토글이 켜지고 T+인 LoRA의 트리거를 긍정 프롬프트 앞에 붙입니다. 노드 아래 `적용될 프롬프트`에 그 문장이 바로 보입니다. T+만 켜고 왼쪽 토글이 꺼져 있으면 태그는 붙지 않습니다.

`리전 기본 프롬프트`는 그 문장을 리전 페인터의 Base 칸 대신 공통 문장으로 넣습니다. 페인터 창에는 자동완성이 없으므로, 긴 기본 문장은 이 연결로 넘기고 칠한 레이어에는 부위 태그만 적습니다.

`구도 설정`은 LAKIS 궤도 패널을 참고한 노드입니다. 노브와 슬라이더로 `from_left`, `from_right`, `from_behind` 태그와 시점 문장을 만듭니다. `combined_prompt`를 긍정 프롬프트나 `Anima LoRA 프롬프트`의 prompt에 연결합니다. 3D 포즈 에디터의 카메라와는 별개입니다.
