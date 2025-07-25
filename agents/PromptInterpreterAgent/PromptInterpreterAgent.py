import importlib.resources as pkg_resources
import logging
from typing import Annotated, Sequence, Literal
from typing_extensions import TypedDict
from langchain_core.tools import Tool
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode


from agents.base.AgentBase import AgentBase
from components.LLM.base.LLMBase import LLMBase
from components.messages.base.MessageBase import MessageBase
from components.messages.HumanMessage import HumanMessage
from components.messages.SystemMessage import SystemMessage
from components.conversation.MaxConversation import MaxConversation
from . import templates


class AgentState(TypedDict):
    messages: Annotated[Sequence[MessageBase], lambda x, y: x + y]
    sender: str


class PromptInterpreterAgent(AgentBase):
    """
    A stateful agent that automatically loads its system prompt
    from agents/PromptInterpreterAgent/templates/SystemPromptTemplate.md
    """

    def __init__(self, **data):
        super().__init__(**data)
        # Auto-load system prompt from template
        if self.SystemPrompt is None:
            self.SystemPrompt = self._load_system_prompt()
            self.log("System prompt auto-loaded from template.", logging.DEBUG)

        self.conversation = MaxConversation(max_messages=10)
        self.conversation.add_message(SystemMessage(content=self.SystemPrompt))

    def _load_system_prompt(self) -> str:
        """
        Load system prompt from the agent's own templates directory.
        Uses importlib.resources for cross-platform, package-safe access.
        """
        try:
            # Python 3.9+
            with (
                pkg_resources.files(templates)
                .joinpath("SystemPromptTemplate.md")
                .open(encoding="utf-8") as f
            ):
                content = f.read().strip()
            if not content:
                raise ValueError("System prompt template is empty.")
            self.log("Successfully loaded embedded system prompt.", logging.INFO)
            return content
        except Exception as e:
            self.log(f"Failed to load system prompt: {e}", logging.ERROR)
            raise RuntimeError(f"Could not load system prompt from templates: {e}")

    def bind_tools(self, tools: list):
        self.tools = tools
        return self

    def bind_llm(self, llm: "LLMBase"):
        self.LLM = llm
        return self

    def _get_bound_llm(self):
        if not self.LLM:
            raise ValueError("LLM not set. Call .bind_llm() first.")
        return dict(self.LLM)

    def run(self, input_msg: str) -> str:
        """
        Main execution method for the agent.
        Takes an input message, adds it to the conversation history,
        and returns the agent's response.
        """
        self.conversation.add_message(HumanMessage(content=input_msg))
        llm_response = self.llm(self.conversation)
        return llm_response.content
