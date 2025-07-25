import logging
import os
from pydantic import Field, model_validator
from typing import List, Optional, Any, ClassVar

from components.LLM.base.LLMBase import LLMBase, LLMConfigBase
from components.messages.AssistantMessage import AssistantMessage
from typing import Dict
import requests
import json


class MiniMaxConfig(LLMConfigBase):
    """
    Configuration class for the MiniMax LLM chat completion API.

    Defines parameters for controlling generation, sampling, privacy, and tool usage.

    Attributes:
        stream (bool): Whether to return results in batches via streaming.
        max_tokens (int): Maximum number of tokens to generate (between 1 and 40,000).
        temperature (float): Sampling temperature (between 0.0 and 1.0). Controls randomness.
        top_p (float): Nucleus sampling probability mass (between 0.0 and 1.0).
        mask_sensitive_info (bool): If True, masks private information in the output.
        tools (Optional[List[Any]]): List of tools the model may call (functions only).

    Methods:
        check_temperature_and_top_p():
            Validator to ensure only one of 'temperature' or 'top_p' is set to a non-default value,
            preventing conflicting sampling strategies as per MiniMax documentation.
    Raises:
        ValueError: If both 'temperature' and 'top_p' are set to non-default values.
    """

    stream: bool = Field(
        default=False,
        description="Whether to return the results in batches by streaming.",
    )
    max_tokens: int = Field(
        default=8192,
        ge=1,
        le=40000,
        description="The maximum number of tokens that can be generated in the chat completion.",
    )
    temperature: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Sampling temperature to use."
    )
    top_p: float = Field(
        default=0.95, gt=0.0, le=1.0, description="Nucleus sampling probability mass."
    )
    mask_sensitive_info: bool = Field(
        default=False,
        description="Mask content in the output that involves private information.",
    )
    tools: Optional[List[Any]] = Field(
        default=None,
        description="A list of tools the model may call. Only functions are supported.",
    )

    def __setattr__(self, name, value):
        # Allow setting during initialization
        if not hasattr(self, "_initialized") or name == "_initialized":
            super().__setattr__(name, value)
        else:
            raise AttributeError(
                "Direct modification of configuration attributes is not allowed. Use the setter method."
            )

    def __init__(self, **data):
        super().__init__(**data)
        self._initialized = True

    def set_config(self, name, value):
        # Explicit setter method for controlled changes
        super().__setattr__(name, value)
        # Re-run validation if needed
        self.check_temperature_and_top_p()

    # Validator to ensure that only one of temperature or top_p is set to a non-default value.
    # This is to prevent conflicting sampling strategies as per MiniMax's documentation.
    # https://www.minimax.io/platform/document/ChatCompletion%20v2?key=66701d281d57f38758d581d0
    # Prevent attribute changes except via explicit setter
    def check_temperature_and_top_p(self):
        temp = self.temperature
        top_p = self.top_p
        # Only raise if both are set to non-default values
        if temp != 1.0 and top_p != 0.95:
            raise ValueError(
                "It is not recommended to set both 'temperature' and 'top_p'. Please set only one."
            )

    @model_validator(mode="after")
    def _check_temperature_and_top_p(self):
        self.check_temperature_and_top_p()
        return self


class MiniMax(LLMBase):
    model: str = Field(
        default="MiniMax-Text-01", description="Model name for MiniMax LLM."
    )
    _models: list = ["MiniMax-M1", "MiniMax-Text-01"]

    api_key: Optional[str] = Field(
        default_factory=lambda: os.getenv("MINIMAX_API_KEY", ""),
        description="API key for MiniMax LLM.",
    )
    group_id: str = Field(
        default_factory=lambda: os.getenv("MINIMAX_GROUP_ID", ""),
        description="Group ID for MiniMax LLM.",
    )

    config: MiniMaxConfig = Field(
        default_factory=MiniMaxConfig, description="Configuration for MiniMax LLM."
    )

    BASE_URL: str = "https://api.minimax.io/v1/text/chatcompletion_v2"

    def get_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _prepare_payload(
        self, messages, tools=None, tool_choice=None, image_inputs=None
    ) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": messages,
        }
        # Add config fields if not default
        config_fields = self.config.__fields__
        for field_name, field_info in config_fields.items():
            value = getattr(self.config, field_name)
            default = field_info.get_default()
            if value is not None and value != default:
                payload[field_name] = value
        if tools:
            payload["tools"] = tools
        if tool_choice:
            payload["tool_choice"] = tool_choice
        if image_inputs:
            # Insert image inputs into the last user message's content
            for msg in reversed(payload["messages"]):
                if msg.get("role") == "user":
                    msg["content"] = image_inputs
                    break
        return payload

    def call_minimax(
        self, messages, tools=None, tool_choice=None, image_inputs=None
    ) -> Optional[dict]:
        payload = self._prepare_payload(messages, tools, tool_choice, image_inputs)
        try:
            response = requests.post(
                self.BASE_URL,
                headers=self.get_headers(),
                json=payload,
                params={"GroupId": self.group_id},
            )
            response.raise_for_status()
            result = response.json()
            if result.get("base_resp", {}).get("status_code", -1) != 0:
                self.log(
                    f"API Error: {result.get('base_resp', {}).get('status_msg', 'Unknown error')}",
                    logging.ERROR,
                )
                return None
            return result
        except requests.exceptions.RequestException as e:
            self.log(f"Error calling Minimax API: {e}", logging.ERROR)
            if hasattr(e, "response") and e.response is not None:
                self.log(f"Response text: {e.response.text}", logging.ERROR)
            return None
        except (KeyError, IndexError) as e:
            self.log(f"Error parsing Minimax response: {e}", logging.ERROR)
            self.log(
                f"Response JSON: {response.json() if 'response' in locals() else 'No response'}",
                logging.ERROR,
            )
            return None

    def chat(
        self,
        messages: list,
        image_inputs: Optional[list] = None,
        tools: Optional[list] = None,
        tool_choice: Optional[str] = None,
        **kwargs,
    ) -> Any:
        """
        Unified interface for MiniMax chat completion.
        """
        result = self.call_minimax(messages, tools, tool_choice, image_inputs)
        return result

    def __call__(self, conversation, **kwargs):
        messages = conversation.serialized_history()
        print(messages)

        image_inputs = getattr(conversation, "image_inputs", None)
        tools = getattr(conversation, "tools", None)
        tool_choice = getattr(conversation, "tool_choice", None)

        response = self.chat(
            messages=messages,
            image_inputs=image_inputs,
            tools=tools,
            tool_choice=tool_choice,
            **kwargs,
        )
        self.log(f"MiniMax response: {response}", logging.DEBUG)

        if isinstance(response, dict) and "choices" in response and response["choices"]:
            agent_content = response["choices"][0]["message"]["content"]
        else:
            agent_content = ""

        ai_message = AssistantMessage(content=agent_content)
        conversation.add_message(ai_message)
        return ai_message
