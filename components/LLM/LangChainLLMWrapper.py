# components/LLM/LangChainLLMWrapper.py
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    BaseMessage,
    HumanMessage,
    AIMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.outputs import ChatResult, ChatGeneration
from langchain_core.pydantic_v1 import Field as PydanticField
from langchain_core.callbacks import CallbackManagerForLLMRun
from typing import (
    List,
    Dict,
    Optional,
    Any,
)
from components.LLM.base.LLMBase import LLMBase
import logging

# For tool conversion
from langchain_core.utils.function_calling import convert_to_openai_tool


class LangChainLLMWrapper(BaseChatModel):
    """
    Fully controlled wrapper for your custom LLMBase.
    Enables seamless integration with LangChain agents, LangGraph, etc.
    """

    llm_base: LLMBase = PydanticField(
        ..., description="Your custom Minimax or other LLM implementation"
    )
    default_tool_choice: Optional[str] = PydanticField(
        default=None,
        description="Default tool choice: 'auto', 'none', or specific function",
    )

    logger: Optional[logging.Logger] = None

    class Config:
        arbitrary_types_allowed = True

    @property
    def _llm_type(self) -> str:
        model = getattr(self.llm_base, "model", "custom-llm")
        return f"custom-{model}"

    def _convert_message_to_minimax_format(
        self, message: BaseMessage
    ) -> Dict[str, str]:
        """
        Convert LangChain message to your LLM's expected format.
        Minimax uses: {"sender_type": "user"|"bot"|"system", "text": "..."}
        """
        type_to_sender = {
            "human": "user",
            "ai": "bot",
            "system": "system",
            "tool": "bot",  # tool response comes from bot
        }
        sender_type = type_to_sender.get(message.type, "user")
        return {"sender_type": sender_type, "text": message.content}

    def _convert_messages_to_minimax(
        self, messages: List[BaseMessage]
    ) -> List[Dict[str, str]]:
        return [self._convert_message_to_minimax_format(msg) for msg in messages]

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        """
        Main sync generation method.
        Called by LangChain during .invoke()
        """
        try:
            # Convert messages
            minimax_msgs = self._convert_messages_to_minimax(messages)

            # Handle tools
            tools = None
            tool_choice = self.default_tool_choice or kwargs.get("tool_choice")

            if "tools" in kwargs and kwargs["tools"]:
                # Convert LangChain tools to OpenAI-style dict
                tools = [convert_to_openai_tool(tool) for tool in kwargs["tools"]]

            # Call your LLM
            raw_response = self.llm_base.chat(
                messages=minimax_msgs,
                tools=tools,
                tool_choice=tool_choice,
                **{
                    k: v for k, v in kwargs.items() if k not in ["tools", "tool_choice"]
                },
            )

            # Parse response
            # Assume your LLM returns a dict if tool call, else string
            if isinstance(raw_response, dict):
                content = raw_response.get("text", "")
                function_call = raw_response.get("function_call")

                if function_call:
                    # Tool call
                    ai_message = AIMessage(
                        content="",
                        tool_calls=[
                            {
                                "name": function_call["name"],
                                "args": function_call["arguments"],
                                "id": "call_1",  # Minimax doesn't return ID, so fake it
                            }
                        ],
                    )
                else:
                    ai_message = AIMessage(content=content)
            else:
                # Plain text response
                ai_message = AIMessage(content=str(raw_response))

            generation = ChatGeneration(message=ai_message)
            return ChatResult(generations=[generation])

        except Exception as e:
            self.log(f"LLM call failed: {e}", level=logging.ERROR)
            if run_manager:
                run_manager.on_llm_error(e)
            raise

    def log(self, message: str, level=logging.INFO):
        if self.logger:
            self.logger.log(level, message)
        else:
            print(f"[LLMWrapper] {message}")

    def _get_invocation_params(self, **kwargs: Any) -> Dict[str, Any]:
        return {
            "model": getattr(self.llm_base, "model", "unknown"),
            "provider": "minimax",
            **kwargs,
        }
