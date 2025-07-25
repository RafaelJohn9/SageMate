from components.messages.base.MessageBase import MessageBase


class HumanMessage(MessageBase):
    """
    Human message representing input from a user.

    This message type is used to encapsulate user-provided content
    in a conversation sequence.
    """

    role: str = "user"
