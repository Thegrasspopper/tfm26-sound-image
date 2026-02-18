
export interface SunoRequest {
    uploadUrl: string;
    customMode?: boolean;
    instrumental?: boolean;
    model?: string;
    callBackUrl?: string;
    prompt?: string;
    style?: string;
    title?: string;
    personaId?: string;
    personaModel?: string;
    negativeTags?: string;
    vocalGender?: string;
    styleWeight?: number;
    weirdnessConstraint?: number;
    audioWeight?: number;
}

export const generateCoverWithSuno = async (sunoRequest: SunoRequest) => {
    const apiKey =  process.env.SUNO_API_KEY;
    
    try {
        const response = await fetch('https://api.sunoapi.org/api/v1/generate/upload-cover', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                uploadUrl: sunoRequest.uploadUrl,
                customMode: sunoRequest.customMode || true,
                instrumental: sunoRequest.instrumental || true,
                model: sunoRequest.model || 'V4_5ALL',
                callBackUrl: sunoRequest.callBackUrl,
                prompt: sunoRequest.prompt,
                style: sunoRequest.style,
                title: sunoRequest.title,
                personaId: sunoRequest.personaId,
                personaModel: sunoRequest.personaModel || 'style_persona',
                negativeTags: sunoRequest.negativeTags,
                vocalGender: sunoRequest.vocalGender || 'm',
                styleWeight: sunoRequest.styleWeight || 0.65,
                weirdnessConstraint: sunoRequest.weirdnessConstraint || 0.65,
                audioWeight: sunoRequest.audioWeight || 0.65,
            }),
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error generating cover:', error);
        throw error;
    }
};
