// MobileNetV2(기본 모델)만 담은 nsfwjs. 앱이 esm.sh 대신 이 파일을 불러옵니다.
import { load as loadCore } from "nsfwjs/core";
import { MobileNetV2Model } from "nsfwjs/models/mobilenet_v2";
export const load = (options) => loadCore("MobileNetV2", { ...options, modelDefinitions: [MobileNetV2Model] });
