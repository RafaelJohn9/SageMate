from components.messages.base.MessageBase import MessageBase


class MaxConversation:
    def __init__(self, max_messages: int = 10):
        self.max_messages = max_messages
        self._history = []

    def add_message(self, message: MessageBase):
        if not isinstance(message, MessageBase):
            raise TypeError("message must be an instance of MessageBase")
        self._history.append(message)
        if len(self._history) > self.max_messages:
            self._history.pop(0)

    @property
    def history(self):
        return list(self._history)

    def serialized_history(self):
        return [dict(msg) for msg in self._history]

    def clear(self):
        self._history.clear()

    def latest_message(self):
        if not self._history:
            return None
        return self._history[-1]
